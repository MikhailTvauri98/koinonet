<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\Push\PushTransport;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Notifications\Events\BroadcastNotificationCreated;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Tests\Support\FakePushTransport;

uses(DatabaseMigrations::class);

afterEach(function () {
    if (isset($this->announcementQueue)) {
        Queue::connection('redis')->clear($this->announcementQueue);
    }
});

it('delivers committed publications through a real local worker and keeps database and broadcast when push is off', function () {
    $queue = $this->announcementQueue = 'task-8-'.str()->ulid();
    config()->set(['queue.default' => 'redis', 'queue.connections.redis.queue' => $queue, 'broadcasting.default' => 'log']);
    $transport = new FakePushTransport;
    app()->instance(PushTransport::class, $transport);
    $publisher = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $publisherSubscription = PushSubscription::factory()->for($publisher)->create();
    $recipient = User::factory()->create();
    PushSubscription::factory()->for($recipient)->create();
    NotificationSetting::query()->create(['user_id' => $recipient->id, 'category' => 'announcements', 'enabled' => false]);
    $broadcasts = [];
    Event::listen(BroadcastNotificationCreated::class, function (BroadcastNotificationCreated $event) use (&$broadcasts): void {
        $broadcasts[$event->notifiable->id] = $event->broadcastWith();
    });

    $id = DB::transaction(function () use ($queue) {
        $id = $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Собрание', 'body' => 'В **10:00**'])->assertCreated()->json('data.id');
        expect(Queue::size($queue))->toBe(0);

        return $id;
    });

    try {
        DB::transaction(function () use ($queue): void {
            $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Откат', 'body' => 'Б'])->assertCreated();
            expect(Queue::size($queue))->toBe(1);
            throw new RuntimeException('Rollback publication');
        });
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('Rollback publication');
    }

    expect(Queue::size($queue))->toBe(1)->and($recipient->notifications()->count())->toBe(0);
    // The worker shares Pest's process, which has already run the rest of the suite.
    $this->artisan('queue:work', ['connection' => 'redis', '--queue' => $queue, '--stop-when-empty' => true, '--sleep' => 0, '--tries' => 1, '--max-time' => 20, '--memory' => 512])->assertSuccessful();

    expect(Queue::size($queue))->toBe(0)->and(DB::table('failed_jobs')->count())->toBe(0)
        ->and($publisher->notifications()->count())->toBe(1)->and($recipient->notifications()->count())->toBe(1)
        ->and($transport->sent)->toHaveCount(1)->and($broadcasts)->toHaveCount(2);
    expect($transport->sent[0])->toMatchArray([
        'endpoint' => $publisherSubscription->endpoint,
        'payload' => [
            'category' => 'announcements', 'title' => 'Собрание', 'body' => 'В 10:00',
            'url' => "/announcements/{$id}", 'tag' => "announcement-{$id}", 'icon' => '/icons/icon-192.png',
        ],
    ]);
    $entry = $recipient->notifications()->firstOrFail();
    expect($entry->data)->toMatchArray([
        'category' => 'announcements', 'title' => 'Собрание', 'body' => 'В 10:00',
        'url' => "/announcements/{$id}", 'tag' => "announcement-{$id}",
    ])->and($broadcasts[$recipient->id])->toMatchArray([
        ...$entry->data, 'id' => $entry->id, 'type' => 'notification.created', 'read_at' => null,
    ]);
    expect($broadcasts[$recipient->id]['created_at'])->toEndWith('Z');
});
