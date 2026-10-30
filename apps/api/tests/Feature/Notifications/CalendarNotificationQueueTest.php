<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Listeners\NotifyAboutAssignment;
use App\Modules\Notifications\Listeners\NotifyAboutEventCancellation;
use App\Modules\Notifications\Listeners\NotifyAboutEventChange;
use App\Modules\Notifications\Listeners\NotifyAboutNewEvent;
use App\Modules\Notifications\Notifications\AssignmentCreatedNotification;
use App\Modules\Notifications\Notifications\AssignmentRemovedNotification;
use App\Modules\Notifications\Notifications\EventAnnouncedNotification;
use App\Modules\Notifications\Notifications\EventCancelledNotification;
use App\Modules\Notifications\Notifications\EventChangedNotification;
use Illuminate\Events\CallQueuedListener;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Queue\Jobs\SyncJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;

uses(DatabaseMigrations::class);

it('registers calendar listeners and delivers only after the outer commit', function (string $action, string $listener, string $notification) {
    Notification::fake();
    Queue::fake();
    actingAsUserWith([Permission::CalendarChurchManage]);
    $user = User::factory()->create();
    $event = Event::factory()->create();
    $slot = EventSlot::factory()->for($event)->create();
    $assignment = EventAssignment::factory()->for($slot, 'slot')->for($user->person)->create();
    $newAssignee = User::factory()->create();
    DB::transaction(function () use ($action, $event, $slot, $assignment, $newAssignee): void {
        match ($action) {
            'created' => $this->postJson('/api/v1/events', [
                'owner_type' => 'church', 'title' => 'Собрание', 'starts_at' => '2026-11-08T07:00:00Z',
                'ends_at' => '2026-11-08T09:00:00Z', 'visibility' => 'church', 'notify' => 'all',
            ])->assertCreated(),
            'assigned' => $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $newAssignee->person_id])->assertCreated(),
            'removed' => $this->deleteJson("/api/v1/assignments/{$assignment->id}")->assertNoContent(),
            'changed' => $this->patchJson("/api/v1/events/{$event->id}", ['location' => 'Зал 2'])->assertOk(),
            'cancelled' => $this->postJson("/api/v1/events/{$event->id}/cancel", ['reason' => 'Ремонт'])->assertOk(),
        };
        Queue::assertNothingPushed();
        Notification::assertNothingSent();
    });
    Queue::assertPushed(CallQueuedListener::class, fn ($job) => $job->class === $listener);
    $jobs = Queue::pushed(CallQueuedListener::class, fn ($job) => $job->class === $listener);
    expect($jobs)->toHaveCount(1);
    $job = unserialize(serialize($jobs->first()));
    $job->setJob(new SyncJob(app(), '{}', 'sync', 'default'));
    $job->handle(app());
    Notification::assertSentTo($action === 'assigned' ? $newAssignee : $user, $notification);
})->with([
    ['created', NotifyAboutNewEvent::class, EventAnnouncedNotification::class],
    ['assigned', NotifyAboutAssignment::class, AssignmentCreatedNotification::class],
    ['removed', NotifyAboutAssignment::class, AssignmentRemovedNotification::class],
    ['changed', NotifyAboutEventChange::class, EventChangedNotification::class],
    ['cancelled', NotifyAboutEventCancellation::class, EventCancelledNotification::class],
]);

it('does not enqueue notification listeners for a rolled back calendar change', function () {
    Notification::fake();
    Queue::fake();
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    try {
        DB::transaction(function () use ($event): void {
            $this->patchJson("/api/v1/events/{$event->id}", ['location' => 'Откат'])->assertOk();
            throw new RuntimeException('Rollback calendar change');
        });
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('Rollback calendar change');
    }
    Queue::assertNothingPushed();
    Notification::assertNothingSent();
    expect($event->fresh()->location)->toBeNull();
});
