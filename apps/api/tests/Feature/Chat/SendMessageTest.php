<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Chat\Actions\SendMessage;
use App\Modules\Chat\Events\MessageSent;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\MediaAccess;
use App\Modules\Media\MediaStatus;
use App\Modules\Media\Models\Media;
use App\Support\DomainRuleException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

uses(RefreshDatabase::class);

beforeEach(fn () => Storage::fake('media'));

it('sends text and updates the last message with an event', function () {
    Event::fake([MessageSent::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $response = $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => ' Привет '])
        ->assertCreated()->assertJsonPath('data.body', 'Привет')->assertJsonPath('data.sender.id', $user->id);
    expect($chat->fresh()->last_message_id)->toBe($response->json('data.id'))
        ->and($chat->fresh()->last_message_at)->not->toBeNull();
    Event::assertDispatched(MessageSent::class, fn ($event) => $event->chatId === $chat->id && $event->senderUserId === $user->id);
});

it('validates empty and overlong messages', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => '   '])
        ->assertUnprocessable()->assertJsonPath('code', 'message.empty');
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => str_repeat('а', 4001)])
        ->assertUnprocessable()->assertJsonValidationErrors('body');
    expect(Message::query()->count())->toBe(0);
});

it('sends attachment-only messages and serves media through chat access', function () {
    $user = actingAsUser();
    $member = User::factory()->create();
    $chat = Chat::factory()->withMembers($user, $member)->create();
    $media = Media::factory()->create(['uploader_user_id' => $user->id]);
    Storage::disk('media')->put($media->path, 'image');
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['media_ids' => [$media->id]])
        ->assertCreated()->assertJsonPath('data.body', null)->assertJsonPath('data.attachments.0.id', $media->id);
    expect(app(MediaAccess::class)->canView($member, $media))->toBeTrue();
    $url = URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]);
    $this->actingAs($member)->get($url)->assertOk();
    $chat->members()->where('user_id', $user->id)->delete();
    expect(app(MediaAccess::class)->canView($user, $media))->toBeFalse()
        ->and(app(MediaAccess::class)->canView(User::factory()->create(), $media))->toBeFalse();
    $this->actingAs($user)->get($url)->assertForbidden();
});

it('rejects foreign unready and already attached media atomically', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $foreign = Media::factory()->create();
    $unready = Media::factory()->create(['uploader_user_id' => $user->id, 'status' => MediaStatus::Processing]);
    foreach ([[$foreign, 'media.not_owned'], [$unready, 'media.not_ready']] as [$media, $code]) {
        $this->postJson("/api/v1/chats/{$chat->id}/messages", ['media_ids' => [$media->id]])
            ->assertUnprocessable()->assertJsonPath('code', $code);
    }
    expect(Message::query()->count())->toBe(0)->and($chat->fresh()->last_message_id)->toBeNull();
    $used = Media::factory()->create(['uploader_user_id' => $user->id]);
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['media_ids' => [$used->id]])->assertCreated();
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['media_ids' => [$used->id]])
        ->assertUnprocessable()->assertJsonPath('code', 'media.already_attached');
    expect(Message::query()->count())->toBe(1);
});

it('allows replies only within the same chat', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $own = Message::factory()->for($chat)->from($user)->create(['body' => 'Исходное']);
    $foreign = Message::factory()->create();
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Ответ', 'reply_to_id' => $foreign->id])
        ->assertUnprocessable()->assertJsonPath('code', 'message.reply_other_chat');
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Ответ', 'reply_to_id' => $own->id])
        ->assertCreated()->assertJsonPath('data.reply_to.body_preview', 'Исходное');
});

it('rejects strangers readers and archived writes without leaking validation', function () {
    $member = User::factory()->create();
    $chat = Chat::factory()->withMembers($member)->create();
    actingAsUser();
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => ''])->assertForbidden();
    $ministry = ministryWithRoles();
    $ministryChat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $reader = actingAsUserWith([Permission::MinistriesViewAll]);
    $this->actingAs($reader);
    $this->postJson("/api/v1/chats/{$ministryChat->id}/messages", ['body' => 'Привет'])->assertForbidden();
    $this->actingAs($member);
    $chat->update(['archived_at' => now()]);
    $this->postJson("/api/v1/chats/{$chat->id}/messages", ['body' => 'Привет'])
        ->assertUnprocessable()->assertJsonPath('code', 'chat.archived');
});

it('rechecks persisted archive and membership inside the action', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $chat->load('members');
    Chat::query()->whereKey($chat->id)->update(['archived_at' => now()]);
    expect(fn () => app(SendMessage::class)->handle($user, $chat, 'text', [], null))
        ->toThrow(DomainRuleException::class, 'Чат архивирован');
    Chat::query()->whereKey($chat->id)->update(['archived_at' => null]);
    $chat->members()->delete();
    expect(fn () => app(SendMessage::class)->handle($user, $chat, 'text', [], null))
        ->toThrow(AuthorizationException::class);
    expect(Message::query()->count())->toBe(0);
});

it('does not publish an event or retain a message after outer rollback', function () {
    Event::fake([MessageSent::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    DB::beginTransaction();
    app(SendMessage::class)->handle($user, $chat, 'text', [], null);
    Event::assertNotDispatched(MessageSent::class);
    DB::rollBack();
    Event::assertNotDispatched(MessageSent::class);
    expect(Message::query()->count())->toBe(0)->and($chat->fresh()->last_message_id)->toBeNull();
});

it('publishes the event only after the outer transaction commits', function () {
    Event::fake([MessageSent::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    DB::beginTransaction();
    $message = app(SendMessage::class)->handle($user, $chat, 'text', [], null);
    Event::assertNotDispatched(MessageSent::class);
    DB::commit();
    Event::assertDispatched(MessageSent::class, fn ($event) => $event->messageId === $message->id);
});

it('uses shared chat visibility for avatars and read-only reader attachments', function () {
    $uploader = User::factory()->create();
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $avatar = Media::factory()->create(['uploader_user_id' => $uploader->id]);
    $chat->update(['avatar_media_id' => $avatar->id]);
    $message = Message::factory()->for($chat)->from($uploader)->create();
    $attachment = Media::factory()->create(['uploader_user_id' => $uploader->id]);
    $message->attachments()->create(['media_id' => $attachment->id, 'sort_order' => 0, 'created_at' => now()]);
    $reader = actingAsUserWith([Permission::MinistriesViewAll]);
    foreach ([$avatar, $attachment] as $media) {
        expect(app(MediaAccess::class)->canView($reader, $media))->toBeTrue()
            ->and(app(MediaAccess::class)->canView($uploader, $media))->toBeFalse();
    }
    $message->update(['deleted_at' => now()]);
    expect(app(MediaAccess::class)->canView($reader, $attachment))->toBeFalse();
});
