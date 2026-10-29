<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\Events\AssignmentCreated;
use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Listeners\NotifyAboutAssignment;
use App\Modules\Notifications\Notifications\AssignmentCreatedNotification;
use App\Modules\Notifications\Notifications\AssignmentRemovedNotification;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;

uses(RefreshDatabase::class);

beforeEach(fn () => Notification::fake());

it('notifies the assigned account with Russian church time slot and event routing', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'Europe/Moscow']);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08 07:00Z'), CarbonImmutable::parse('2026-11-08 09:00Z'))->create();
    $slot = EventSlot::factory()->for($event)->create(['label' => 'Звук']);
    $user = User::factory()->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $user->person_id])->assertCreated();

    Notification::assertSentTo($user, AssignmentCreatedNotification::class, function ($notification) use ($user, $event) {
        $data = $notification->toArray($user);

        return $data['category'] === 'assignments' && $data['title'] === 'Вас назначили'
            && $data['url'] === "/events/{$event->id}" && $data['tag'] === "event-{$event->id}"
            && str_contains($data['body'], '8 ноя') && str_contains($data['body'], '10:00')
            && str_contains($data['body'], 'Звук');
    });
    Notification::assertCount(1);
});

it('notifies removal after the last assignment loses visibility including archived slot history', function (bool $removeSlot) {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->visibility(EventVisibility::Assigned)->create();
    $slot = EventSlot::factory()->for($event)->create(['label' => 'Исторический звук']);
    $user = User::factory()->create();
    $assignment = EventAssignment::factory()->for($slot, 'slot')->for($user->person)->create();

    $this->deleteJson($removeSlot ? "/api/v1/slots/{$slot->id}" : "/api/v1/assignments/{$assignment->id}")->assertNoContent();

    Notification::assertSentTo($user, AssignmentRemovedNotification::class, fn ($notification) => $notification->title() === 'Назначение снято'
        && str_contains($notification->body(), 'Исторический звук')
        && $notification->toArray($user)['url'] === "/events/{$event->id}"
        && $notification->toArray($user)['tag'] === "event-{$event->id}");
    expect($assignment->fresh()->archived_at)->not->toBeNull();
    Notification::assertCount(1);
})->with([false, true]);

it('skips self assignment and self removal but permits a null actor', function () {
    $user = actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $id = $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $user->person_id])->assertCreated()->json('data.id');
    $this->deleteJson("/api/v1/assignments/{$id}")->assertNoContent();
    Notification::assertNothingSent();

    app(NotifyAboutAssignment::class)->handle(new AssignmentRemoved($slot->event_id, $slot->id, $user->person_id, $user->id, null));
    Notification::assertSentTo($user, AssignmentRemovedNotification::class);
});

it('skips people without accounts during assignment creation', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => Person::factory()->create()->id])->assertCreated();
    Notification::assertNothingSent();
});

it('does not deliver an obsolete assignment creation after it was removed', function () {
    $user = User::factory()->create();
    $slot = EventSlot::factory()->create();
    EventAssignment::factory()->for($slot, 'slot')->for($user->person)->create(['archived_at' => now()]);
    app(NotifyAboutAssignment::class)->handle(new AssignmentCreated($slot->event_id, $slot->id, $user->person_id, $user->id, null));
    Notification::assertNothingSent();
});

it('rechecks assignment recipients and parents at queued delivery time', function (string $state, string $kind) {
    $user = User::factory()->create();
    $slot = EventSlot::factory()->create();
    if ($state === 'disabled') {
        $user->update(['disabled_at' => now()]);
    } elseif ($state === 'person archived') {
        $user->person->update(['archived_at' => now()]);
    } elseif ($state === 'event archived') {
        $slot->event->update(['archived_at' => now()]);
    } elseif ($state === 'slot archived') {
        $slot->update(['archived_at' => now()]);
    }
    $eventClass = $kind === 'created' ? AssignmentCreated::class : AssignmentRemoved::class;
    $payload = new $eventClass($state === 'event missing' ? (string) str()->ulid() : $slot->event_id,
        $state === 'slot missing' ? (string) str()->ulid() : $slot->id, $user->person_id,
        $state === 'account missing' ? (string) str()->ulid() : ($state === 'no account' ? null : $user->id), null);

    app(NotifyAboutAssignment::class)->handle($payload);

    if ($state === 'slot archived' && $kind === 'removed') {
        Notification::assertSentTo($user, AssignmentRemovedNotification::class);
    } else {
        Notification::assertNothingSent();
    }
})->with(['disabled', 'person archived', 'event archived', 'event missing', 'slot missing', 'slot archived', 'account missing', 'no account'])->with(['created', 'removed']);
