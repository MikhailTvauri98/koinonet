<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionCache;
use App\Modules\Chat\Actions\ChatAccountEraser;
use App\Modules\Chat\Broadcasts\ChatMembersChangedBroadcast;
use App\Modules\Chat\Broadcasts\ChatPinnedBroadcast;
use App\Modules\Chat\Broadcasts\ChatUpdatedBroadcast;
use App\Modules\Chat\Broadcasts\MessageDeletedBroadcast;
use App\Modules\Chat\Broadcasts\MessageEditedBroadcast;
use App\Modules\Chat\Broadcasts\MessageSentBroadcast;
use App\Modules\Chat\Broadcasts\UnreadTotalBroadcast;
use App\Modules\Chat\Events\ChatMembersChanged;
use App\Modules\Chat\Events\ChatPinsChanged;
use App\Modules\Chat\Events\ChatRead;
use App\Modules\Chat\Events\MessageDeleted;
use App\Modules\Chat\Events\MessageEdited;
use App\Modules\Chat\Events\MessageSent;
use App\Modules\Chat\Listeners\BroadcastChatChanges;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use Dedoc\Scramble\Generator;
use Illuminate\Broadcasting\BroadcastEvent;
use Illuminate\Contracts\Broadcasting\Broadcaster;
use Illuminate\Contracts\Broadcasting\Factory;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Events\CallQueuedListener;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;

uses(RefreshDatabase::class);

it('dispatches a content free shared signal and personalized member changes', function () {
    Event::fake([MessageSentBroadcast::class, ChatUpdatedBroadcast::class, UnreadTotalBroadcast::class]);
    $sender = actingAsUser();
    $other = User::factory()->create();
    $chat = Chat::factory()->withMembers($sender, $other)->create(['created_by_user_id' => $sender->id]);
    $message = Message::factory()->for($chat)->from($sender)->create(['body' => 'Secret']);
    app(BroadcastChatChanges::class)->handle(new MessageSent($chat->id, $message->id, $sender->id));
    Event::assertDispatched(MessageSentBroadcast::class, fn ($event) => $event->broadcastAs() === 'message.sent'
        && $event->broadcastOn()->name === "private-chat.{$chat->id}" && $event->broadcastWith() === ['message_id' => $message->id]);
    Event::assertDispatched(ChatUpdatedBroadcast::class, fn ($event) => $event->broadcastOn()->name === "private-user.{$other->id}"
        && $event->broadcastWith()['chat']['unread_count'] === 1);
    Event::assertDispatched(ChatUpdatedBroadcast::class, fn ($event) => $event->broadcastOn()->name === "private-user.{$sender->id}" && $event->broadcastWith()['chat']['unread_count'] === 0);
    Event::assertDispatched(UnreadTotalBroadcast::class, fn ($event) => $event->broadcastOn()->name === "private-user.{$other->id}" && $event->broadcastWith() === ['total' => 1]);
    Event::assertDispatched(UnreadTotalBroadcast::class, fn ($event) => $event->broadcastOn()->name === "private-user.{$sender->id}"
        && $event->broadcastWith() === ['total' => 0]);
});

it('hydrates a signal using current authorization and a deleted tombstone', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $message = Message::factory()->for($chat)->create(['deleted_at' => now(), 'body' => null]);
    $this->getJson("/api/v1/messages/{$message->id}")->assertOk()->assertJsonPath('data.deleted', true);
    $chat->members()->where('user_id', $user->id)->delete();
    $this->getJson("/api/v1/messages/{$message->id}")->assertForbidden();
});

/** Execute the real serialized queue job, capturing only its final transport boundary. */
function deliverChatBroadcast(object $event): array
{
    $job = unserialize(serialize(new BroadcastEvent($event)));
    $sent = [];
    $transport = Mockery::mock(Broadcaster::class);
    $transport->shouldReceive('broadcast')->zeroOrMoreTimes()->andReturnUsing(function ($channels, $name, $payload) use (&$sent): void {
        $sent[] = ['channels' => array_map(fn ($channel) => (string) $channel, $channels), 'name' => $name, 'payload' => $payload];
    });
    $manager = Mockery::mock(Factory::class);
    $manager->shouldReceive('connection')->zeroOrMoreTimes()->andReturn($transport);
    $job->handle($manager);

    return $sent;
}

it('resolves removal readdition read and deletion at actual serialized job delivery', function () {
    $user = actingAsUser();
    $sender = User::factory()->create();
    $chat = Chat::factory()->withMembers($user, $sender)->create();
    $message = Message::factory()->for($chat)->from($sender)->create(['body' => 'Before']);
    $chat->update(['last_message_id' => $message->id]);
    $update = unserialize(serialize(new ChatUpdatedBroadcast($chat->id, $user->id)));
    $total = unserialize(serialize(new UnreadTotalBroadcast($user->id)));
    $chat->members()->where('user_id', $user->id)->delete();
    expect(deliverChatBroadcast($update)[0]['payload'])->toBe(['chat' => ['id' => $chat->id], 'removed' => true, 'socket' => null]);
    expect(deliverChatBroadcast($total)[0]['payload']['total'])->toBe(0);
    $chat->members()->create(['user_id' => $user->id, 'joined_at' => now()]);
    $message->update(['body' => null, 'deleted_at' => now()]);
    $payload = deliverChatBroadcast($update)[0]['payload'];
    expect($payload)->not->toHaveKey('removed')
        ->and($payload['chat']['unread_count'])->toBe(0)
        ->and($payload['chat']['last_message']['deleted'])->toBeTrue()
        ->and($payload['chat']['last_message']['body_preview'])->toBe('Сообщение удалено');
    $user->update(['disabled_at' => now()]);
    expect(deliverChatBroadcast($update))->toBe([])->and(deliverChatBroadcast($total))->toBe([]);
});

it('uses recipient policy instead of global authentication for direct titles at delivery', function () {
    $privileged = actingAsUserWith([Permission::PeopleView]);
    $other = User::factory()->create();
    $chat = Chat::factory()->direct($privileged, $other)->create();
    Message::factory()->for($chat)->from($privileged)->create();
    $update = new ChatUpdatedBroadcast($chat->id, $other->id);
    expect(deliverChatBroadcast($update)[0]['payload']['chat']['title'])->toBe('Личный чат');
    $privilegedUpdate = unserialize(serialize(new ChatUpdatedBroadcast($chat->id, $privileged->id)));
    expect(deliverChatBroadcast($privilegedUpdate)[0]['payload']['chat']['title'])->toBe($other->person->fullName());
    $privileged->person->globalRoles()->detach();
    app(PermissionCache::class)->bump($privileged->id);
    expect(deliverChatBroadcast($privilegedUpdate)[0]['payload']['chat']['title'])->toBe('Личный чат');
});

it('keeps empty direct updates hidden until a message exists and excludes erased accounts', function () {
    $a = actingAsUser();
    $b = User::factory()->create();
    $chat = Chat::factory()->direct($a, $b)->create();
    $event = new ChatUpdatedBroadcast($chat->id, $b->id);
    expect(deliverChatBroadcast($event))->toBe([]);
    Message::factory()->for($chat)->from($a)->create();
    expect(deliverChatBroadcast($event))->toHaveCount(1);
    app(ChatAccountEraser::class)->eraseAccount($b->id);
    $b->delete();
    expect(deliverChatBroadcast($event))->toBe([])->and(deliverChatBroadcast(new UnreadTotalBroadcast($b->id)))->toBe([]);
});

it('keeps all five shared event contracts free of content', function () {
    $chatId = (string) str()->ulid();
    $messageId = (string) str()->ulid();
    $userId = (string) str()->ulid();
    $events = [
        [new MessageSentBroadcast($chatId, $messageId), 'message.sent', ['message_id' => $messageId]],
        [new MessageEditedBroadcast($chatId, $messageId), 'message.edited', ['message_id' => $messageId]],
        [new MessageDeletedBroadcast($chatId, $messageId), 'message.deleted', ['message_id' => $messageId]],
        [new ChatPinnedBroadcast($chatId), 'chat.pinned', ['chat_id' => $chatId]],
        [new ChatMembersChangedBroadcast($chatId, [$userId], []), 'chat.members_changed', ['added' => [$userId], 'removed' => []]],
    ];
    foreach ($events as [$event, $name, $payload]) {
        expect($event)->toBeInstanceOf(ShouldBroadcast::class)
            ->and($event->broadcastAs())->toBe($name)->and($event->broadcastOn()->name)->toBe("private-chat.{$chatId}")
            ->and($event->broadcastWith())->toBe($payload);
        expect(deliverChatBroadcast($event)[0])->toBe(['channels' => ["private-chat.{$chatId}"], 'name' => $name, 'payload' => [...$payload, 'socket' => null]]);
    }
});

it('queues the domain listener separately from broadcast jobs', function () {
    Queue::fake();
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $message = Message::factory()->for($chat)->from($user)->create();
    event(new MessageSent($chat->id, $message->id, $user->id));
    Queue::assertPushed(CallQueuedListener::class,
        fn ($job) => $job->class === BroadcastChatChanges::class);
    Queue::assertNotPushed(BroadcastEvent::class);
    app(BroadcastChatChanges::class)->handle(new MessageSent($chat->id, $message->id, $user->id));
    Queue::assertPushed(BroadcastEvent::class, 5);
});

it('updates only the reader after read and never personalizes for nonmember readers', function () {
    Event::fake([ChatUpdatedBroadcast::class, UnreadTotalBroadcast::class]);
    $user = actingAsUser();
    $other = User::factory()->create();
    $ministry = ministryWithRoles();
    memberOf($ministry, $user->person);
    memberOf($ministry, $other->person);
    $reader = actingAsUserWith([Permission::MinistriesViewAll]);
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk();
    Event::fake([ChatUpdatedBroadcast::class, UnreadTotalBroadcast::class]);
    app(BroadcastChatChanges::class)->handle(new ChatRead($chat->id, $user->id));
    Event::assertDispatchedTimes(ChatUpdatedBroadcast::class, 1);
    Event::assertDispatched(ChatUpdatedBroadcast::class, fn ($event) => $event->broadcastOn()->name === "private-user.{$user->id}");
    Event::assertDispatchedTimes(UnreadTotalBroadcast::class, 1);
    Event::fake([MessageSentBroadcast::class, ChatUpdatedBroadcast::class, UnreadTotalBroadcast::class]);
    $message = Message::factory()->for($chat)->from($user)->create();
    app(BroadcastChatChanges::class)->handle(new MessageSent($chat->id, $message->id, $user->id));
    Event::assertDispatchedTimes(ChatUpdatedBroadcast::class, 2);
    Event::assertNotDispatched(ChatUpdatedBroadcast::class, fn ($event) => $event->broadcastOn()->name === "private-user.{$reader->id}");
    Event::assertNotDispatched(UnreadTotalBroadcast::class, fn ($event) => $event->broadcastOn()->name === "private-user.{$reader->id}");
});
it('fans out all change types and removal stubs with fresh totals', function () {
    $user = actingAsUser();
    $removed = User::factory()->create();
    $chat = Chat::factory()->withMembers($user)->create(['created_by_user_id' => $user->id]);
    $message = Message::factory()->for($chat)->from($user)->create();
    $types = [
        [new MessageEdited($chat->id, $message->id), MessageEditedBroadcast::class],
        [new MessageDeleted($chat->id, $message->id), MessageDeletedBroadcast::class],
        [new ChatPinsChanged($chat->id), ChatPinnedBroadcast::class],
        [new ChatMembersChanged($chat->id, [$user->id], [$removed->id]), ChatMembersChangedBroadcast::class],
    ];
    foreach ($types as [$domain, $broadcast]) {
        Event::fake([$broadcast, ChatUpdatedBroadcast::class, UnreadTotalBroadcast::class]);
        app(BroadcastChatChanges::class)->handle($domain);
        Event::assertDispatchedTimes($broadcast, 1);
        Event::assertDispatched(ChatUpdatedBroadcast::class, fn ($event) => $event->broadcastOn()->name === "private-user.{$user->id}");
        if ($domain instanceof ChatMembersChanged) {
            Event::assertDispatched(ChatUpdatedBroadcast::class, fn ($event) => $event->broadcastOn()->name === "private-user.{$removed->id}"
                && $event->broadcastWith() === ['chat' => ['id' => $chat->id], 'removed' => true]);
            Event::assertDispatched(UnreadTotalBroadcast::class, fn ($event) => $event->broadcastOn()->name === "private-user.{$removed->id}" && $event->broadcastWith() === ['total' => 0]);
        }
    }
});

it('hydrates identities for the current viewer and enforces reader and disabled access', function () {
    $sender = User::factory()->create();
    $viewer = actingAsUser();
    $chat = Chat::factory()->withMembers($viewer, $sender)->create();
    $reply = Message::factory()->for($chat)->from($sender)->create();
    $message = Message::factory()->for($chat)->from($sender)->create(['reply_to_id' => $reply->id]);
    $url = "/api/v1/messages/{$message->id}";
    $this->getJson($url)->assertOk()->assertJsonPath('data.sender.person.full_name', null)->assertJsonPath('data.reply_to.sender_name', null);
    $role = Role::factory()->global()->withPermissions([Permission::PeopleView])->create();
    $viewer->person->globalRoles()->attach($role);
    app(PermissionCache::class)->bump($viewer->id);
    $this->getJson($url)->assertOk()->assertJsonPath('data.sender.person.full_name', $sender->person->fullName())
        ->assertJsonPath('data.reply_to.sender_name', $sender->person->fullName());
    app('auth')->forgetGuards();
    $this->actingAs($sender)->getJson($url)->assertOk()->assertJsonPath('data.sender.person.full_name', $sender->person->fullName());
    $ministry = ministryWithRoles();
    $ministryChat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $ministryMessage = Message::factory()->for($ministryChat)->from($sender)->create();
    app('auth')->forgetGuards();
    $reader = actingAsUserWith([Permission::MinistriesViewAll]);
    $this->getJson("/api/v1/messages/{$ministryMessage->id}")->assertOk();
    $reader->update(['disabled_at' => now()]);
    $this->getJson("/api/v1/messages/{$ministryMessage->id}")->assertForbidden();
});

it('documents authorized single message hydration with the same precise resource schema', function () {
    $schema = app(Generator::class)();
    $response = $schema['paths']['/messages/{message}']['get']['responses'][200]['content']['application/json']['schema'];
    expect($response['properties']['data']['$ref'])->toBe('#/components/schemas/MessageResource');
});
