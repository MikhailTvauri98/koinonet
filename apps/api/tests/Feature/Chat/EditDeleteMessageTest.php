<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Chat\Actions\DeleteMessage;
use App\Modules\Chat\Actions\EditMessage;
use App\Modules\Chat\Events\MessageDeleted;
use App\Modules\Chat\Events\MessageEdited;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use App\Support\DomainRuleException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\ValidationException;

uses(RefreshDatabase::class);
beforeEach(fn () => Storage::fake('media'));

it('rejects message mutation with a stale disabled actor', function (string $action) {
    Event::fake([MessageEdited::class, MessageDeleted::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $message = Message::factory()->for($chat)->from($user)->create(['body' => 'Сохранённый текст']);
    User::query()->whereKey($user->id)->update(['disabled_at' => now()]);
    expect($user->isDisabled())->toBeFalse();
    expect(fn () => $action === 'edit'
        ? app(EditMessage::class)->handle($message, 'Правка', $user)
        : app(DeleteMessage::class)->handle($message, $user))->toThrow(AuthorizationException::class);
    expect($message->fresh()->body)->toBe('Сохранённый текст')
        ->and($message->fresh()->deleted_at)->toBeNull();
    Event::assertNotDispatched(MessageEdited::class);
    Event::assertNotDispatched(MessageDeleted::class);
})->with(['edit', 'delete']);

it('edits own messages without an age limit and publishes after commit', function () {
    Event::fake([MessageEdited::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $message = Message::factory()->for($chat)->from($user)->create(['created_at' => now()->subYears(2)]);
    DB::beginTransaction();
    $this->patchJson("/api/v1/messages/{$message->id}", ['body' => ' Новый текст '])
        ->assertOk()->assertJsonPath('data.body', 'Новый текст')->assertJsonPath('data.edited_at', fn ($v) => $v !== null);
    Event::assertNotDispatched(MessageEdited::class);
    DB::commit();
    Event::assertDispatched(MessageEdited::class, fn ($e) => $e->chatId === $chat->id && $e->messageId === $message->id);
});

it('validates blank and overlong edits but accepts attachment-only edits', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $message = Message::factory()->for($chat)->from($user)->create();
    $this->patchJson("/api/v1/messages/{$message->id}", ['body' => ' '])->assertUnprocessable()->assertJsonPath('code', 'message.empty');
    $this->patchJson("/api/v1/messages/{$message->id}", ['body' => str_repeat('а', 4001)])->assertUnprocessable()->assertJsonValidationErrors('body');
    $this->patchJson("/api/v1/messages/{$message->id}", ['body' => str_repeat('а', 4000)])->assertOk();
    $media = Media::factory()->create(['uploader_user_id' => $user->id]);
    $message->attachments()->create(['media_id' => $media->id, 'sort_order' => 0, 'created_at' => now()]);
    $this->patchJson("/api/v1/messages/{$message->id}", ['body' => ' '])->assertOk()->assertJsonPath('data.body', null);
});

it('rejects edits by another member and mutations by former members or in archives', function () {
    $author = User::factory()->create();
    $other = actingAsUser();
    $chat = Chat::factory()->withMembers($author, $other)->create();
    $message = Message::factory()->for($chat)->from($author)->create();
    $this->patchJson("/api/v1/messages/{$message->id}", ['body' => 'x'])->assertForbidden();
    $this->actingAs($author);
    $chat->members()->where('user_id', $author->id)->delete();
    $this->patchJson("/api/v1/messages/{$message->id}", ['body' => 'x'])->assertForbidden();
    $this->deleteJson("/api/v1/messages/{$message->id}")->assertForbidden();
    $chat->members()->create(['user_id' => $author->id, 'joined_at' => now()]);
    $chat->update(['archived_at' => now()]);
    $this->patchJson("/api/v1/messages/{$message->id}", ['body' => 'x'])->assertForbidden();
    $this->deleteJson("/api/v1/messages/{$message->id}")->assertForbidden();
});

it('rechecks stale message deletion archive and membership inside actions', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $message = Message::factory()->for($chat)->from($user)->create();
    $message->load('chat.members');
    Message::query()->whereKey($message->id)->update(['deleted_at' => now()]);
    expect(fn () => app(EditMessage::class)->handle($message, 'x', $user))->toThrow(DomainRuleException::class)
        ->and(fn () => app(DeleteMessage::class)->handle($message, $user))->toThrow(DomainRuleException::class);
    Message::query()->whereKey($message->id)->update(['deleted_at' => null]);
    Chat::query()->whereKey($chat->id)->update(['archived_at' => now()]);
    expect(fn () => app(EditMessage::class)->handle($message, 'x', $user))->toThrow(AuthorizationException::class)
        ->and(fn () => app(DeleteMessage::class)->handle($message, $user))->toThrow(AuthorizationException::class);
    Chat::query()->whereKey($chat->id)->update(['archived_at' => null]);
    $chat->members()->where('user_id', $user->id)->delete();
    expect(fn () => app(EditMessage::class)->handle($message, 'x', $user))->toThrow(AuthorizationException::class)
        ->and(fn () => app(DeleteMessage::class)->handle($message, $user))->toThrow(AuthorizationException::class);
});

it('deletes into a tombstone retains the last pointer and rejects repeated mutation', function () {
    Event::fake([MessageDeleted::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $reply = Message::factory()->for($chat)->create();
    $media = Media::factory()->create(['uploader_user_id' => $user->id]);
    Storage::disk('media')->put($media->path, 'bytes');
    $id = $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'text', 'media_ids' => [$media->id], 'reply_to_id' => $reply->id])->json('data.id');
    $this->deleteJson("/api/v1/messages/{$id}")->assertNoContent();
    $message = Message::query()->findOrFail($id);
    expect($message->deleted_at)->not->toBeNull()->and($message->body)->toBeNull()->and($message->reply_to_id)->toBeNull()
        ->and($message->attachments()->count())->toBe(0)->and($media->fresh())->toBeNull()
        ->and(AuditEntry::query()->where('action', 'message.deleted_by_moderator')->count())->toBe(0);
    Storage::disk('media')->assertMissing($media->path);
    $this->getJson('/api/v1/chats')->assertJsonPath('data.0.last_message.deleted', true);
    $this->deleteJson("/api/v1/messages/{$id}")->assertUnprocessable()->assertJsonPath('code', 'message.deleted');
    $this->patchJson("/api/v1/messages/{$id}", ['body' => 'x'])->assertUnprocessable()->assertJsonPath('code', 'message.deleted');
    Event::assertDispatchedTimes(MessageDeleted::class, 1);
});

it('rolls back edits deletion audit attachments bytes and events with the outer transaction', function () {
    Event::fake([MessageEdited::class, MessageDeleted::class]);
    $moderator = actingAsUser();
    $author = User::factory()->create();
    $chat = Chat::factory()->create(['created_by_user_id' => $moderator->id]);
    $chat->members()->create(['user_id' => $author->id, 'joined_at' => now()]);
    $message = Message::factory()->for($chat)->from($author)->create(['body' => 'original']);
    $media = Media::factory()->create(['uploader_user_id' => $author->id]);
    $message->attachments()->create(['media_id' => $media->id, 'sort_order' => 0, 'created_at' => now()]);
    Storage::disk('media')->put($media->path, 'bytes');
    DB::beginTransaction();
    app(EditMessage::class)->handle($message, 'changed', $author);
    app(DeleteMessage::class)->handle($message, $moderator);
    Storage::disk('media')->assertExists($media->path);
    Event::assertNotDispatched(MessageEdited::class);
    Event::assertNotDispatched(MessageDeleted::class);
    DB::rollBack();
    expect($message->fresh()->body)->toBe('original')->and($message->fresh()->deleted_at)->toBeNull()
        ->and($message->attachments()->count())->toBe(1)->and($media->fresh())->not->toBeNull()
        ->and(AuditEntry::query()->where('action', 'message.deleted_by_moderator')->count())->toBe(0);
    Storage::disk('media')->assertExists($media->path);
    Event::assertNotDispatched(MessageEdited::class);
    Event::assertNotDispatched(MessageDeleted::class);
    DB::beginTransaction();
    app(DeleteMessage::class)->handle($message, $moderator);
    Storage::disk('media')->assertExists($media->path);
    DB::commit();
    Storage::disk('media')->assertMissing($media->path);
    Event::assertDispatched(MessageDeleted::class);
    expect(AuditEntry::query()->where('action', 'message.deleted_by_moderator')->sole()->actor_user_id)->toBe($moderator->id);
});

it('validates body rules and persisted authorship on direct action calls', function () {
    $actor = actingAsUser();
    $other = User::factory()->create();
    $chat = Chat::factory()->withMembers($actor, $other)->create();
    $message = Message::factory()->for($chat)->from($actor)->create();
    expect(fn () => app(EditMessage::class)->handle($message, ' ', $actor))->toThrow(DomainRuleException::class)
        ->and(fn () => app(EditMessage::class)->handle($message, str_repeat('а', 4001), $actor))->toThrow(ValidationException::class);
    Message::query()->whereKey($message->id)->update(['sender_user_id' => $other->id]);
    expect(fn () => app(EditMessage::class)->handle($message, 'x', $actor))->toThrow(AuthorizationException::class)
        ->and(fn () => app(DeleteMessage::class)->handle($message, $actor))->toThrow(AuthorizationException::class);
});
