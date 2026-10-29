<?php

declare(strict_types=1);

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventReminder;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Listeners\NotifyAboutReminder;
use App\Modules\Notifications\Notifications\EventReminderNotification;
use Carbon\CarbonImmutable;
use Illuminate\Events\CallQueuedListener;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Queue\Jobs\SyncJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;

uses(DatabaseMigrations::class);

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-11-07T10:00:00Z'));
    Notification::fake();
    Queue::fake();
});

it('registers the queued reminder listener after the outer commit and rechecks the event before delivery', function (string $state) {
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08T10:02:00Z'), CarbonImmutable::parse('2026-11-08T12:00:00Z'))->create();
    $user = User::factory()->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create(), 'slot')->for($user->person)->create();
    DB::transaction(function (): void {
        $this->artisan('calendar:send-reminders')->assertSuccessful();
        $this->artisan('calendar:send-reminders')->assertSuccessful();
        expect(EventReminder::query()->count())->toBe(1);
        Queue::assertNothingPushed();
    });
    Queue::assertPushed(CallQueuedListener::class, fn ($job) => $job->class === NotifyAboutReminder::class);
    $jobs = Queue::pushed(CallQueuedListener::class);
    expect($jobs)->toHaveCount(1);
    if ($state === 'cancelled') {
        $event->update(['status' => 'cancelled']);
    } elseif ($state === 'archived') {
        $event->update(['archived_at' => now()]);
    }
    $job = unserialize(serialize($jobs->sole()));
    $job->setJob(new SyncJob(app(), '{}', 'sync', 'default'));
    $job->handle(app());
    if ($state !== 'scheduled') {
        Notification::assertNothingSent();

        return;
    }
    Notification::assertSentTo($user, EventReminderNotification::class);
    Notification::assertCount(1);
    $late = User::factory()->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create(), 'slot')->for($late->person)->create();
    $this->travelTo(CarbonImmutable::parse('2026-11-07T10:06:00Z'));
    $this->artisan('calendar:send-reminders')->assertSuccessful();
    Queue::assertPushed(CallQueuedListener::class, 1);
    Notification::assertNotSentTo($late, EventReminderNotification::class);
})->with(['scheduled', 'cancelled', 'archived']);

it('rolls back the reminder marker without enqueueing delivery and permits retry', function () {
    Event::factory()->between(CarbonImmutable::parse('2026-11-08T10:02:00Z'), CarbonImmutable::parse('2026-11-08T12:00:00Z'))->create();
    try {
        DB::transaction(function (): void {
            $this->artisan('calendar:send-reminders')->assertSuccessful();
            throw new RuntimeException('Reminder rollback');
        });
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('Reminder rollback');
    }
    expect(EventReminder::query()->count())->toBe(0);
    Queue::assertNothingPushed();
    $this->artisan('calendar:send-reminders')->assertSuccessful();
    expect(EventReminder::query()->count())->toBe(1);
    Queue::assertPushed(CallQueuedListener::class, 1);
});
