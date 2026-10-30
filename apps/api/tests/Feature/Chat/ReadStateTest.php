<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Chat\Actions\MarkChatRead;
use App\Modules\Chat\Events\ChatRead;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Chat\UnreadCounter;
use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;
use Dedoc\Scramble\Generator;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

it('advances read state and returns fresh membership scoped counts excluding own and deleted messages', function () {
    $user = actingAsUser();
    $other = User::factory()->create();
    $chat = Chat::factory()->withMembers($user)->create();
    $time = CarbonImmutable::parse('2026-12-01T10:00:00Z');
    $first = Message::factory()->for($chat)->from($other)->at($time)->create();
    Message::factory()->for($chat)->from($other)->at($time->addSecond())->create();
    Message::factory()->for($chat)->at($time->addSeconds(2))->create(['sender_user_id' => null]);
    Message::factory()->for($chat)->from($user)->at($time->addSeconds(3))->create();
    Message::factory()->for($chat)->from($other)->at($time->addSeconds(4))->deleted()->create();
    $secondChat = Chat::factory()->withMembers($user)->archived()->create();
    Message::factory()->for($secondChat)->from($other)->create();
    Message::factory()->create(); // Not a membership: never included in total.
    expect(app(UnreadCounter::class)->forChat($user, $chat))->toBe(3);
    $this->postJson("/api/v1/chats/{$chat->id}/read", ['message_id' => $first->id])
        ->assertOk()->assertExactJson(['unread_count' => 2, 'unread_total' => 3]);
    expect($chat->members()->where('user_id', $user->id)->sole()->last_read_message_id)->toBe($first->id);
});

it('uses timestamps with microseconds before ids and never regresses from stale loaded state', function () {
    Event::fake([ChatRead::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $time = CarbonImmutable::parse('2026-12-01T10:00:00.123456Z');
    $ids = ['01j00000000000000000000003', '01j00000000000000000000001', '01j00000000000000000000002'];
    $older = Message::factory()->for($chat)->at($time)->create(['id' => $ids[0]]);
    $newer = Message::factory()->for($chat)->at($time->addMicrosecond())->create(['id' => $ids[1]]);
    $tie = Message::factory()->for($chat)->at($time->addMicrosecond())->create(['id' => $ids[2]]);
    $chat->load('members');
    foreach ([$older, $newer, $tie, $newer, $older, $tie] as $message) {
        app(MarkChatRead::class)->handle($user, $chat, $message->id);
    }
    expect($chat->members()->where('user_id', $user->id)->sole()->last_read_message_id)->toBe($tie->id);
    Event::assertDispatchedTimes(ChatRead::class, 3);
});

it('allows archived members to use own and soft deleted messages as pointers', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->archived()->create();
    $own = Message::factory()->for($chat)->from($user)->at(CarbonImmutable::now()->subSecond())->create();
    $deleted = Message::factory()->for($chat)->deleted()->create();
    foreach ([$own, $deleted] as $message) {
        $this->postJson("/api/v1/chats/{$chat->id}/read", ['message_id' => $message->id])
            ->assertOk()->assertExactJson(['unread_count' => 0, 'unread_total' => 0]);
    }
    expect($chat->members()->where('user_id', $user->id)->sole()->last_read_message_id)->toBe($deleted->id);
});

it('rejects foreign and missing messages without moving state', function () {
    Event::fake([ChatRead::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $foreign = Message::factory()->create();
    foreach ([$foreign->id, '01j00000000000000000000000'] as $id) {
        $this->postJson("/api/v1/chats/{$chat->id}/read", ['message_id' => $id])
            ->assertUnprocessable()->assertJsonPath('code', 'message.not_in_chat');
    }
    expect($chat->members()->where('user_id', $user->id)->sole()->last_read_message_id)->toBeNull();
    Event::assertNotDispatched(ChatRead::class);
});

it('rejects a readable ministry nonmember as read only', function () {
    actingAsUserWith([Permission::MinistriesViewAll]);
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $message = Message::factory()->for($chat)->create();
    $this->postJson("/api/v1/chats/{$chat->id}/read", ['message_id' => $message->id])
        ->assertUnprocessable()->assertJsonPath('code', 'chat.read_only');
});

it('denies unrelated and disabled users before validation', function (bool $disabled) {
    $user = actingAsUser();
    $chat = Chat::factory()->create();
    if ($disabled) {
        $chat->members()->create(['user_id' => $user->id, 'joined_at' => now()]);
        $user->update(['disabled_at' => now()]);
    }
    $this->postJson("/api/v1/chats/{$chat->id}/read", [])->assertForbidden();
})->with([false, true]);

it('validates the message identifier', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    foreach ([[], ['message_id' => 'junk'], ['message_id' => []]] as $payload) {
        $this->postJson("/api/v1/chats/{$chat->id}/read", $payload)->assertUnprocessable()->assertJsonValidationErrors('message_id');
    }
});

it('rechecks persisted membership and account access inside the action', function (bool $disable) {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $message = Message::factory()->for($chat)->create();
    $chat->load('members');
    if ($disable) {
        User::query()->whereKey($user->id)->update(['disabled_at' => now()]);
    } else {
        $chat->members()->where('user_id', $user->id)->delete();
    }
    expect(fn () => app(MarkChatRead::class)->handle($user, $chat, $message->id))->toThrow(AuthorizationException::class);
})->with([false, true]);

it('publishes once only after outer commit and never for a repeat or rollback', function () {
    Event::fake([ChatRead::class]);
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $message = Message::factory()->for($chat)->create();
    DB::beginTransaction();
    app(MarkChatRead::class)->handle($user, $chat, $message->id);
    Event::assertNotDispatched(ChatRead::class);
    DB::rollBack();
    Event::assertNotDispatched(ChatRead::class);
    expect($chat->members()->where('user_id', $user->id)->sole()->last_read_message_id)->toBeNull();
    DB::beginTransaction();
    app(MarkChatRead::class)->handle($user, $chat, $message->id);
    Event::assertNotDispatched(ChatRead::class);
    DB::commit();
    Event::assertDispatched(ChatRead::class, fn ($event) => $event->chatId === $chat->id && $event->userId === $user->id);
    app(MarkChatRead::class)->handle($user, $chat, $message->id);
    Event::assertDispatchedTimes(ChatRead::class, 1);
});

it('documents integer read response counts and required message id', function () {
    $schema = app(Generator::class)();
    $operation = $schema['paths']['/chats/{chat}/read']['post'];
    $response = $operation['responses'][200]['content']['application/json']['schema'];
    expect($response['type'])->toBe('object')->and($response['required'])->toBe(['unread_count', 'unread_total']);
    foreach (['unread_count', 'unread_total'] as $field) {
        expect($response['properties'][$field]['type'])->toBe('integer');
    }
    $body = $operation['requestBody']['content']['application/json']['schema'];
    if (isset($body['$ref'])) {
        $body = $schema['components']['schemas'][basename($body['$ref'])];
    }
    expect($body['required'])->toBe(['message_id'])->and($body['properties']['message_id']['type'])->toBe('string');
});
