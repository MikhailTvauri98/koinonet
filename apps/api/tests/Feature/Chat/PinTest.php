<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event as CalendarEvent;
use App\Modules\Chat\Actions\DeleteMessage;
use App\Modules\Chat\Actions\PinMessage;
use App\Modules\Chat\Actions\UnpinMessage;
use App\Modules\Chat\Events\ChatPinsChanged;
use App\Modules\Chat\Events\MessageDeleted;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use App\Support\DomainRuleException;
use Dedoc\Scramble\Generator;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

it('lets the owner pin and unpin and returns message resources in the card', function () {
    Event::fake([ChatPinsChanged::class]);
    $owner = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $owner->id]);
    $message = Message::factory()->for($chat)->from($owner)->create(['body' => 'Важно']);
    $this->postJson("/api/v1/messages/{$message->id}/pin")->assertOk()
        ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $message->id)->assertJsonPath('data.0.deleted', false);
    $this->assertDatabaseHas('chat_pinned_messages', ['chat_id' => $chat->id, 'message_id' => $message->id, 'pinned_by_user_id' => $owner->id]);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.pinned_messages.0.body', 'Важно');
    $this->deleteJson("/api/v1/messages/{$message->id}/pin")->assertOk()->assertExactJson(['data' => []]);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertJsonPath('data.pinned_messages', []);
    Event::assertDispatchedTimes(ChatPinsChanged::class, 2);
    Event::assertDispatched(ChatPinsChanged::class, fn ($e) => $e->chatId === $chat->id);
});

it('uses current ministry scoped moderation for both operations', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Другое');
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $otherChat = Chat::query()->where('ministry_id', $other->id)->sole();
    $actor = actingAsUser();
    $role = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Проверка']);
    $role->permissions()->create(['permission' => Permission::ChatModerate->value]);
    memberOf($ministry, $actor->person, [$role->id]);
    $message = Message::factory()->for($chat)->create();
    $foreign = Message::factory()->for($otherChat)->create();
    foreach (['postJson', 'deleteJson'] as $method) {
        $this->$method("/api/v1/messages/{$foreign->id}/pin")->assertForbidden();
        $this->$method("/api/v1/messages/{$message->id}/pin")->assertOk();
    }
});

it('allows global moderators across nondirect kinds and event managers', function () {
    actingAsUserWith([Permission::ChatsModerateAll]);
    $ministry = ministryWithRoles();
    $event = CalendarEvent::factory()->create();
    $eventChat = Chat::factory()->event($event)->create();
    foreach ([Chat::factory()->create(), Chat::query()->where('ministry_id', $ministry->id)->sole(), $eventChat] as $chat) {
        $message = Message::factory()->for($chat)->create();
        $this->postJson("/api/v1/messages/{$message->id}/pin")->assertOk();
        $this->deleteJson("/api/v1/messages/{$message->id}/pin")->assertOk();
    }
    app('auth')->forgetGuards();
    actingAsUserWith([Permission::CalendarChurchManage]);
    $message = Message::factory()->for($eventChat)->create();
    $this->postJson("/api/v1/messages/{$message->id}/pin")->assertOk();
    $this->deleteJson("/api/v1/messages/{$message->id}/pin")->assertOk();
});

it('denies plain members direct chats archives former owners and disabled actors', function (string $kind) {
    Event::fake([ChatPinsChanged::class]);
    $actor = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $actor->id]);
    if ($kind === 'plain') {
        $chat->members()->where('user_id', $actor->id)->update(['is_owner' => false]);
    } elseif ($kind === 'former') {
        $chat->members()->where('user_id', $actor->id)->delete();
    } elseif ($kind === 'archived') {
        $chat->update(['archived_at' => now()]);
    } elseif ($kind === 'disabled') {
        $actor->update(['disabled_at' => now()]);
    } else {
        $chat = Chat::factory()->direct($actor, User::factory()->create())->create();
    }
    $message = Message::factory()->for($chat)->from($actor)->create();
    foreach (['postJson', 'deleteJson'] as $method) {
        $this->$method("/api/v1/messages/{$message->id}/pin")->assertForbidden();
    }
    Event::assertNotDispatched(ChatPinsChanged::class);
})->with(['plain', 'former', 'archived', 'disabled', 'direct']);

it('never allows even global moderation of direct or archived chats', function () {
    $actor = actingAsUserWith([Permission::ChatsModerateAll]);
    foreach ([Chat::factory()->direct($actor, User::factory()->create())->create(), Chat::factory()->archived()->create()] as $chat) {
        $message = Message::factory()->for($chat)->create();
        $this->postJson("/api/v1/messages/{$message->id}/pin")->assertForbidden();
        $this->deleteJson("/api/v1/messages/{$message->id}/pin")->assertForbidden();
    }
});

it('returns domain errors without publishing or changing pins', function () {
    Event::fake([ChatPinsChanged::class]);
    $actor = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $actor->id]);
    $deleted = Message::factory()->for($chat)->deleted()->create();
    $live = Message::factory()->for($chat)->create();
    $this->postJson("/api/v1/messages/{$deleted->id}/pin")->assertUnprocessable()->assertJsonPath('code', 'message.deleted');
    $this->deleteJson("/api/v1/messages/{$live->id}/pin")->assertUnprocessable()->assertJsonPath('code', 'message.not_pinned');
    Event::assertNotDispatched(ChatPinsChanged::class);
    $this->postJson("/api/v1/messages/{$live->id}/pin")->assertOk();
    $this->postJson("/api/v1/messages/{$live->id}/pin")->assertUnprocessable()->assertJsonPath('code', 'message.already_pinned');
    Event::assertDispatchedTimes(ChatPinsChanged::class, 1);
    expect($chat->pins()->count())->toBe(1);
});

it('orders newest pins first with deterministic ties caps responses and excludes deleted messages', function () {
    $actor = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $actor->id]);
    $messages = Message::factory()->count(22)->for($chat)->create();
    foreach ($messages as $message) {
        $chat->pins()->create(['message_id' => $message->id, 'pinned_by_user_id' => $actor->id, 'pinned_at' => now()->subDay()]);
    }
    $deleted = Message::factory()->for($chat)->deleted()->create();
    $chat->pins()->create(['message_id' => $deleted->id, 'pinned_at' => now()->addDay()]);
    $newest = $messages->first();
    $chat->pins()->where('message_id', $newest->id)->update(['pinned_at' => now()]);
    $expected = [$newest->id, ...$messages->skip(1)->pluck('id')->sortDesc()->take(19)->values()->all()];
    $card = $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonCount(20, 'data.pinned_messages');
    expect(array_column($card->json('data.pinned_messages'), 'id'))->toBe($expected);
    $extra = Message::factory()->for($chat)->create();
    $pins = $this->postJson("/api/v1/messages/{$extra->id}/pin")->assertOk()->assertJsonCount(20, 'data')->assertJsonPath('data.0.id', $extra->id);
    expect(array_column($pins->json('data'), 'id'))->not->toContain($deleted->id);
    $unpinned = $this->deleteJson("/api/v1/messages/{$extra->id}/pin")->assertOk()->assertJsonCount(20, 'data');
    expect(array_column($unpinned->json('data'), 'id'))->toBe($expected);
});

it('reuses message identity filtering reply tombstones and attachments for pins', function () {
    Storage::fake('media');
    $actor = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $actor->id]);
    $author = User::factory()->create();
    $reply = Message::factory()->for($chat)->from($author)->deleted()->create();
    $message = Message::factory()->for($chat)->from($author)->create(['reply_to_id' => $reply->id]);
    $media = Media::factory()->create();
    $message->attachments()->create(['media_id' => $media->id, 'sort_order' => 0, 'created_at' => now()]);
    $this->postJson("/api/v1/messages/{$message->id}/pin")->assertOk()
        ->assertJsonPath('data.0.sender.person.full_name', null)->assertJsonPath('data.0.sender.person.photo_thumb_url', null)
        ->assertJsonPath('data.0.reply_to.deleted', true)->assertJsonPath('data.0.reply_to.body_preview', null)
        ->assertJsonPath('data.0.reply_to.sender_name', null)->assertJsonPath('data.0.attachments.0.id', $media->id);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.pinned_messages.0.sender.person.full_name', null)
        ->assertJsonPath('data.pinned_messages.0.attachments.0.id', $media->id);
});

it('publishes pin and unpin changes only after outer commit and preserves state on rollback', function () {
    Event::fake([ChatPinsChanged::class]);
    $actor = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $actor->id]);
    $message = Message::factory()->for($chat)->create();
    DB::beginTransaction();
    app(PinMessage::class)->handle($message, $actor);
    Event::assertNotDispatched(ChatPinsChanged::class);
    DB::rollBack();
    expect($chat->pins()->count())->toBe(0);
    Event::assertNotDispatched(ChatPinsChanged::class);
    DB::beginTransaction();
    app(PinMessage::class)->handle($message, $actor);
    Event::assertNotDispatched(ChatPinsChanged::class);
    DB::commit();
    Event::assertDispatchedTimes(ChatPinsChanged::class, 1);
    DB::beginTransaction();
    app(UnpinMessage::class)->handle($message, $actor);
    DB::rollBack();
    expect($chat->pins()->count())->toBe(1);
    Event::assertDispatchedTimes(ChatPinsChanged::class, 1);
    DB::beginTransaction();
    app(UnpinMessage::class)->handle($message, $actor);
    Event::assertDispatchedTimes(ChatPinsChanged::class, 1);
    DB::commit();
    Event::assertDispatchedTimes(ChatPinsChanged::class, 2);
});

it('atomically removes pins on deletion and emits only when a pin was removed after commit', function () {
    Event::fake([ChatPinsChanged::class, MessageDeleted::class]);
    $actor = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $actor->id]);
    $message = Message::factory()->for($chat)->from($actor)->create();
    $chat->pins()->create(['message_id' => $message->id, 'pinned_at' => now()]);
    DB::beginTransaction();
    app(DeleteMessage::class)->handle($message, $actor);
    expect($chat->pins()->count())->toBe(0);
    Event::assertNotDispatched(ChatPinsChanged::class);
    DB::rollBack();
    expect($chat->pins()->count())->toBe(1)->and($message->fresh()->deleted_at)->toBeNull();
    Event::assertNotDispatched(ChatPinsChanged::class);
    Event::assertNotDispatched(MessageDeleted::class);
    DB::beginTransaction();
    app(DeleteMessage::class)->handle($message, $actor);
    Event::assertNotDispatched(ChatPinsChanged::class);
    DB::commit();
    expect($chat->pins()->count())->toBe(0);
    Event::assertDispatchedTimes(ChatPinsChanged::class, 1);
    Event::assertDispatchedTimes(MessageDeleted::class, 1);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertJsonPath('data.pinned_messages', []);
    $other = Message::factory()->for($chat)->from($actor)->create();
    $this->deleteJson("/api/v1/messages/{$other->id}")->assertNoContent();
    Event::assertDispatchedTimes(ChatPinsChanged::class, 1);
});

it('rechecks stale deletion archive and ownership for direct action calls', function () {
    Event::fake([ChatPinsChanged::class]);
    $actor = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $actor->id]);
    $message = Message::factory()->for($chat)->create();
    $message->load('chat.members');
    Message::query()->whereKey($message->id)->update(['deleted_at' => now()]);
    expect(fn () => app(PinMessage::class)->handle($message, $actor))->toThrow(DomainRuleException::class);
    Message::query()->whereKey($message->id)->update(['deleted_at' => null]);
    foreach (['archive', 'owner'] as $change) {
        if ($change === 'archive') {
            $chat->update(['archived_at' => now()]);
        } else {
            $chat->update(['archived_at' => null]);
            $chat->members()->where('user_id', $actor->id)->update(['is_owner' => false]);
        }
        expect(fn () => app(PinMessage::class)->handle($message, $actor))->toThrow(AuthorizationException::class)
            ->and(fn () => app(UnpinMessage::class)->handle($message, $actor))->toThrow(AuthorizationException::class);
    }
    Event::assertNotDispatched(ChatPinsChanged::class);
    expect($chat->pins()->count())->toBe(0);
});

it('rechecks persisted disabled status instead of trusting the passed actor', function (bool $unpin) {
    Event::fake([ChatPinsChanged::class]);
    $actor = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $actor->id]);
    $message = Message::factory()->for($chat)->create();
    if ($unpin) {
        $chat->pins()->create(['message_id' => $message->id, 'pinned_at' => now()]);
    }
    User::query()->whereKey($actor->id)->update(['disabled_at' => now()]);
    $action = $unpin ? UnpinMessage::class : PinMessage::class;
    expect(fn () => app($action)->handle($message, $actor))->toThrow(AuthorizationException::class);
    expect($chat->pins()->count())->toBe($unpin ? 1 : 0);
    Event::assertNotDispatched(ChatPinsChanged::class);
})->with([false, true]);

it('denies read only ministry viewers without granting pin access', function () {
    Event::fake([ChatPinsChanged::class]);
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $message = Message::factory()->for($chat)->create();
    actingAsUserWith([Permission::MinistriesViewAll]);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.pinned_messages', []);
    $this->postJson("/api/v1/messages/{$message->id}/pin")->assertForbidden();
    $this->deleteJson("/api/v1/messages/{$message->id}/pin")->assertForbidden();
    Event::assertNotDispatched(ChatPinsChanged::class);
});

it('documents pin lists as arrays of full message resources with exact nested scalar types', function () {
    $schema = app(Generator::class)();
    foreach (['post', 'delete'] as $method) {
        $response = $schema['paths']['/messages/{message}/pin'][$method]['responses'][200]['content']['application/json']['schema'];
        expect($response['type'])->toBe('object')->and($response['required'])->toContain('data')
            ->and($response['properties']['data']['type'])->toBe('array')
            ->and($response['properties']['data']['items']['$ref'])->toBe('#/components/schemas/MessageResource');
    }
    $pins = $schema['components']['schemas']['ChatResource']['properties']['pinned_messages'];
    expect($pins['type'])->toBe('array')->and($pins['items']['$ref'])->toBe('#/components/schemas/MessageResource');
    $message = $schema['components']['schemas']['MessageResource']['properties'];
    foreach (['id', 'chat_id', 'created_at', 'cursor'] as $field) {
        expect($message[$field]['type'])->toBe('string');
    }
    expect($message['deleted']['type'])->toBe('boolean')
        ->and($message['body']['type'])->toBe(['string', 'null'])
        ->and($message['edited_at']['type'])->toBe(['string', 'null'])
        ->and($message['sender']['type'])->toBe(['object', 'null'])
        ->and($message['sender']['properties']['id']['type'])->toBe('string')
        ->and($message['sender']['properties']['person']['properties']['id']['type'])->toBe('string')
        ->and($message['sender']['properties']['person']['properties']['full_name']['type'])->toBe(['string', 'null'])
        ->and($message['sender']['properties']['person']['properties']['photo_thumb_url']['type'])->toBe(['string', 'null'])
        ->and($message['reply_to']['type'])->toBe(['object', 'null'])
        ->and($message['reply_to']['properties']['id']['type'])->toBe('string')
        ->and($message['reply_to']['properties']['deleted']['type'])->toBe('boolean')
        ->and($message['reply_to']['properties']['sender_name']['type'])->toBe(['string', 'null'])
        ->and($message['reply_to']['properties']['body_preview']['type'])->toBe(['string', 'null'])
        ->and($message['attachments']['type'])->toBe('array')
        ->and($message['attachments']['items']['$ref'])->toBe('#/components/schemas/MediaResource');
});
