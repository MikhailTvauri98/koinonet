<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\AppNotification;
use App\Modules\Notifications\NotificationCategory;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Events\BroadcastNotificationCreated;
use Tests\TestCase;

uses(TestCase::class);

function sampleNotification(NotificationCategory $category, string $body = 'Текст'): AppNotification
{
    return new class($category, $body) extends AppNotification
    {
        public function __construct(private readonly NotificationCategory $sampleCategory, private readonly string $sampleBody) {}

        public function category(): NotificationCategory
        {
            return $this->sampleCategory;
        }

        public function title(): string
        {
            return 'Заголовок';
        }

        public function body(): string
        {
            return $this->sampleBody;
        }

        public function url(): string
        {
            return '/somewhere';
        }

        public function tag(): string
        {
            return 'sample-1';
        }
    };
}

it('queues notifications and delivers non chat categories to the center and live channel', function (NotificationCategory $category) {
    $notification = sampleNotification($category);

    expect($notification)->toBeInstanceOf(ShouldQueue::class)
        ->and($notification->via(new stdClass))->toEqualCanonicalizing(['database', 'broadcast']);
})->with([NotificationCategory::Announcements, NotificationCategory::Assignments, NotificationCategory::Reminders]);

it('delivers chat to the live channel without a center entry', function () {
    expect(sampleNotification(NotificationCategory::Chat)->via(new stdClass))->toBe(['broadcast']);
});

it('serializes the category and destination with a bounded unicode preview', function () {
    $notification = sampleNotification(NotificationCategory::Reminders, str_repeat('Я', 150));

    expect($notification->toArray(new User))->toBe([
        'category' => 'reminders', 'title' => 'Заголовок', 'body' => str_repeat('Я', 139).'…',
        'url' => '/somewhere', 'tag' => 'sample-1',
    ]);
});

it('broadcasts the notification payload on its account channel under a stable event name', function () {
    $this->freezeTime();
    $user = new User(['id' => '01J00000000000000000000000']);
    $notification = sampleNotification(NotificationCategory::Assignments);
    $notification->id = '8c545e23-3778-44bb-8afe-9d9d5113f144';
    $event = new BroadcastNotificationCreated($user, $notification, $notification->toBroadcast($user)->data);

    expect($user->receivesBroadcastNotificationsOn())->toBe('user.01J00000000000000000000000')
        ->and($notification->broadcastType())->toBe('notification.created')
        ->and($event->broadcastOn()[0]->name)->toBe('private-user.01J00000000000000000000000')
        ->and($event->broadcastAs())->toBe('Illuminate\\Notifications\\Events\\BroadcastNotificationCreated')
        ->and($event->broadcastWith()['type'])->toBe('notification.created')
        ->and($notification->toBroadcast($user)->data)->toBe([
            'id' => '8c545e23-3778-44bb-8afe-9d9d5113f144', 'category' => 'assignments',
            'title' => 'Заголовок', 'body' => 'Текст', 'url' => '/somewhere', 'tag' => 'sample-1',
            'read_at' => null, 'created_at' => now()->toISOString(),
        ]);
});
