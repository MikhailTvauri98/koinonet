<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionCache;
use App\Modules\Chat\Events\MessageSent;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Channels\WebPushChannel;
use App\Modules\Notifications\Listeners\NotifyAboutChatMessage;
use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\Notifications\ChatMessageNotification;
use App\Modules\Notifications\Push\PushTransport;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Notifications\SendQueuedNotifications;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Tests\Support\FakePushTransport;

uses(RefreshDatabase::class);

it('queues only web push for current active unmuted members except the author', function () {
    Queue::fake();
    $sender = User::factory()->create();
    $recipient = User::factory()->create();
    $muted = User::factory()->create();
    $disabled = User::factory()->create(['disabled_at' => now()]);
    $chat = Chat::factory()->withMembers($sender, $recipient, $muted, $disabled)->create();
    foreach ([$sender, $recipient, $muted, $disabled] as $user) {
        PushSubscription::factory()->for($user)->create();
    }
    $chat->members()->where('user_id', $muted->id)->update(['muted_until' => now()->addDay()]);
    $message = Message::factory()->for($chat)->from($sender)->create();
    app(NotifyAboutChatMessage::class)->handle(new MessageSent($chat->id, $message->id, $sender->id));
    Queue::assertPushed(SendQueuedNotifications::class, 1);
    Queue::assertPushed(SendQueuedNotifications::class, fn ($job) => $job->notifiables->sole()->id === $recipient->id && $job->channels === [WebPushChannel::class]);
});

it('rechecks actual serialized queued delivery after eligibility changes', function (string $change) {
    Queue::fake();
    $sender = User::factory()->create();
    $recipient = User::factory()->create();
    PushSubscription::factory()->for($recipient)->create();
    $chat = Chat::factory()->withMembers($sender, $recipient)->create();
    $message = Message::factory()->for($chat)->from($sender)->create();
    $notification = new ChatMessageNotification($message, $chat);
    expect($notification->via($recipient))->toBe([WebPushChannel::class]);
    $job = unserialize(serialize(new SendQueuedNotifications($recipient, $notification, [WebPushChannel::class])));
    match ($change) {
        'removed' => $chat->members()->where('user_id', $recipient->id)->delete(),
        'muted' => $chat->members()->where('user_id', $recipient->id)->update(['muted_until' => now()->addDay()]),
        'category' => NotificationSetting::query()->create(['user_id' => $recipient->id, 'category' => 'chat', 'enabled' => false]),
        'disabled' => $recipient->update(['disabled_at' => now()]),
        'subscription' => PushSubscription::query()->where('user_id', $recipient->id)->delete(),
        'deleted' => $message->update(['deleted_at' => now(), 'body' => null]),
    };
    $transport = new FakePushTransport;
    app()->instance(PushTransport::class, $transport);
    $job->handle(app(ChannelManager::class));
    expect($transport->sent)->toBeEmpty()->and($recipient->notifications()->count())->toBe(0);
})->with(['removed', 'muted', 'category', 'disabled', 'subscription', 'deleted']);

it('resolves current content and identity permissions at queued delivery', function (bool $revoke) {
    Queue::fake();
    $recipient = actingAsUserWith([Permission::PeopleView]);
    $sender = User::factory()->create();
    $sender->person->update(['first_name' => 'Иван', 'last_name' => 'Иванов', 'patronymic' => null]);
    PushSubscription::factory()->for($recipient)->create();
    $chat = Chat::factory()->direct($sender, $recipient)->create();
    $message = Message::factory()->for($chat)->from($sender)->create(['body' => 'Старое']);
    $notification = new ChatMessageNotification($message, $chat);
    expect($notification->toArray($recipient)['title'])->toBe('Иванов Иван');
    $job = unserialize(serialize(new SendQueuedNotifications($recipient, $notification, [WebPushChannel::class])));
    if ($revoke) {
        $recipient->person->globalRoles()->detach();
        app(PermissionCache::class)->bump($recipient->id);
    }
    $message->update(['body' => 'Новое']);
    $transport = new FakePushTransport;
    app()->instance(PushTransport::class, $transport);
    $job->handle(app(ChannelManager::class));
    expect($transport->sent)->toHaveCount(1);
    expect($transport->sent[0]['payload'])->toMatchArray([
        'category' => 'chat', 'title' => $revoke ? 'Личный чат' : 'Иванов Иван',
        'body' => ($revoke ? 'Участник' : 'Иванов Иван').': Новое',
        'url' => "/chats/{$chat->id}", 'tag' => "chat-{$chat->id}",
    ]);
    expect($recipient->notifications()->count())->toBe(0);
})->with([true, false]);

it('builds attachment and erased sender payloads and allows expired mutes', function () {
    Queue::fake();
    $recipient = User::factory()->create();
    PushSubscription::factory()->for($recipient)->create();
    $chat = Chat::factory()->withMembers($recipient)->create(['title' => 'Молодёжка']);
    $message = Message::factory()->for($chat)->create(['sender_user_id' => null, 'body' => null]);
    $chat->members()->where('user_id', $recipient->id)->update(['muted_until' => now()->subSecond()]);
    $notification = new ChatMessageNotification($message, $chat);
    expect($notification->via($recipient))->toBe([WebPushChannel::class])
        ->and($notification->toArray($recipient))->toMatchArray(['title' => 'Молодёжка', 'body' => 'Удалённый человек: Вложение']);
    $job = unserialize(serialize(new SendQueuedNotifications($recipient, $notification, [WebPushChannel::class])));
    $transport = new FakePushTransport;
    app()->instance(PushTransport::class, $transport);
    $job->handle(app(ChannelManager::class));
    expect($transport->sent)->toHaveCount(1);
});

it('registers the message listener for queueing after commit', function () {
    expect(new NotifyAboutChatMessage)->toBeInstanceOf(ShouldQueueAfterCommit::class);
    expect(Event::getRawListeners()[MessageSent::class])->toContain(NotifyAboutChatMessage::class);
});
