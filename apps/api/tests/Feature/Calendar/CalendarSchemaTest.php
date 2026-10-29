<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventReminder;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use App\Modules\Calendar\ReminderKind;
use App\Modules\Calendar\ResourceType;
use App\Modules\Directory\Models\Person;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('rejects invalid event data in the database', function (array $attributes) {
    $event = Event::factory()->create();
    expect(fn () => DB::table('events')->where('id', $event->id)->update($attributes))->toThrow(QueryException::class);
})->with([
    'equal times' => [['starts_at' => '2026-11-08 10:00:00', 'ends_at' => '2026-11-08 10:00:00']],
    'reverse times' => [['starts_at' => '2026-11-08 12:00:00', 'ends_at' => '2026-11-08 10:00:00']],
    'missing ministry' => [['owner_type' => 'ministry', 'ministry_id' => null]],
    'invalid owner' => [['owner_type' => 'other']],
    'church ministry visibility' => [['visibility' => 'ministry']],
    'invalid visibility' => [['visibility' => 'private']],
    'invalid status' => [['status' => 'draft']],
]);

it('forbids a ministry on a church owner', function (string $model) {
    $ministry = ministryWithRoles();
    expect(fn () => $model::factory()->create(['ministry_id' => $ministry->id]))->toThrow(QueryException::class);
})->with([[Event::class], [EventTemplate::class]]);

it('rejects invalid template data in the database', function (array $attributes) {
    $template = EventTemplate::factory()->create();
    expect(fn () => DB::table('event_templates')->where('id', $template->id)->update($attributes))->toThrow(QueryException::class);
})->with([
    'missing ministry' => [['owner_type' => 'ministry']],
    'invalid owner' => [['owner_type' => 'other']],
    'church ministry visibility' => [['visibility' => 'ministry']],
    'invalid visibility' => [['visibility' => 'private']],
    'zero duration' => [['duration_minutes' => 0]],
    'negative duration' => [['duration_minutes' => -1]],
]);

it('accepts only people and positive capacities in slots', function (string $model, array $attributes) {
    $slot = $model::factory()->create();
    expect(fn () => DB::table($slot->getTable())->where('id', $slot->id)->update($attributes))->toThrow(QueryException::class);
})->with([
    [EventSlot::class, ['resource_type' => 'room']],
    [EventSlot::class, ['required_count' => 0]],
    [EventSlot::class, ['required_count' => -1]],
    [EventTemplateSlot::class, ['resource_type' => 'room']],
    [EventTemplateSlot::class, ['required_count' => 0]],
    [EventTemplateSlot::class, ['required_count' => -1]],
]);

it('requires a person resource on assignments', function (array $attributes) {
    $assignment = EventAssignment::factory()->create();
    expect(fn () => DB::table('event_assignments')->where('id', $assignment->id)->update($attributes))->toThrow(QueryException::class);
})->with([
    [['person_id' => null]],
    [['resource_type' => 'room']],
]);

it('does not assign the same person actively to a slot twice', function () {
    $assignment = EventAssignment::factory()->create();
    expect(fn () => EventAssignment::factory()->create([
        'slot_id' => $assignment->slot_id, 'person_id' => $assignment->person_id,
    ]))->toThrow(QueryException::class);
});

it('retains archived assignments and permits reassignment', function () {
    $assignment = EventAssignment::factory()->create(['archived_at' => now()]);
    $replacement = EventAssignment::factory()->create([
        'slot_id' => $assignment->slot_id, 'person_id' => $assignment->person_id,
    ]);
    expect(EventAssignment::query()->count())->toBe(2)
        ->and($assignment->fresh()->archived_at)->toBeInstanceOf(CarbonImmutable::class)
        ->and($replacement->archived_at)->toBeNull();
});

it('keeps a template occurrence unique even when cancelled or archived', function () {
    $template = EventTemplate::factory()->weekly(7)->create();
    Event::factory()->fromTemplate($template, '2026-11-08')->cancelled()->create(['archived_at' => now()]);
    expect(fn () => Event::factory()->fromTemplate($template, '2026-11-08')->create())->toThrow(QueryException::class);
});

it('allows many events without a template on the same date', function () {
    Event::factory()->count(2)->create(['occurrence_date' => '2026-11-08']);
    expect(Event::query()->count())->toBe(2);
});

it('records one reminder of each kind per event', function () {
    $event = Event::factory()->create();
    EventReminder::query()->create(['event_id' => $event->id, 'kind' => 'h24', 'sent_at' => now()]);
    EventReminder::query()->create(['event_id' => $event->id, 'kind' => 'h2', 'sent_at' => now()]);
    expect(fn () => EventReminder::query()->create(['event_id' => $event->id, 'kind' => 'h24', 'sent_at' => now()]))
        ->toThrow(QueryException::class);
});

it('rejects unsupported reminders', function () {
    expect(fn () => DB::table('event_reminders')->insert([
        'event_id' => Event::factory()->create()->id, 'kind' => 'h1', 'sent_at' => now(),
    ]))->toThrow(QueryException::class);
});

it('provides deterministic defaults and immutable calendar casts', function () {
    $this->travelTo(CarbonImmutable::parse('2026-11-07 15:00:00', 'UTC'));
    $event = Event::factory()->create(['occurrence_date' => '2026-11-08']);
    $template = EventTemplate::factory()->create();
    expect($event->owner_type)->toBe(EventOwnerType::Church)
        ->and($event->visibility)->toBe(EventVisibility::Church)
        ->and($event->status)->toBe(EventStatus::Scheduled)
        ->and($event->starts_at)->toEqual(CarbonImmutable::parse('2026-11-08 10:00:00', 'UTC'))
        ->and($event->ends_at)->toEqual(CarbonImmutable::parse('2026-11-08 12:00:00', 'UTC'))
        ->and($event->occurrence_date)->toBeInstanceOf(CarbonImmutable::class)
        ->and($template->start_time)->toBe('10:00:00')
        ->and($template->duration_minutes)->toBe(120)
        ->and($template->active)->toBeTrue()
        ->and($template->recurrence)->toBeNull()
        ->and($event->isCancelled())->toBeFalse()->and($event->isPast())->toBeFalse();
    $this->travelTo($event->ends_at);
    expect($event->isPast())->toBeTrue();
});

it('provides owner visibility time cancellation and recurrence factory states', function () {
    $ministry = ministryWithRoles();
    $template = EventTemplate::factory()->ministry($ministry)->weekly(7)->create();
    $event = Event::factory()->fromTemplate($template, '2026-11-08')->visibility(EventVisibility::Assigned)->cancelled()->create();
    $start = CarbonImmutable::parse('2026-11-08 10:00', 'UTC');
    $timed = Event::factory()->ministry($ministry)->between($start, $start->addHours(1))->create();
    expect($template->recurrence)->toBe(['type' => 'weekly', 'weekday' => 7])
        ->and($event->owner_type)->toBe(EventOwnerType::Ministry)
        ->and($event->ministry->is($ministry))->toBeTrue()
        ->and($event->template->is($template))->toBeTrue()
        ->and($event->visibility)->toBe(EventVisibility::Assigned)
        ->and($event->isCancelled())->toBeTrue()
        ->and($event->cancelled_at)->toBeInstanceOf(CarbonImmutable::class)
        ->and($timed->starts_at)->toEqual($start)
        ->and($timed->ends_at)->toEqual($start->addHour())
        ->and($timed->visibility)->toBe(EventVisibility::Ministry)
        ->and(EventTemplate::factory()->biweekly(7, '2026-11-08')->create()->recurrence)
        ->toBe(['type' => 'biweekly', 'weekday' => 7, 'anchor_date' => '2026-11-08'])
        ->and(EventTemplate::factory()->monthlyNth(-1, 7)->create()->recurrence)
        ->toBe(['type' => 'monthly_nth_weekday', 'nth' => -1, 'weekday' => 7])
        ->and(EventTemplate::factory()->inactive()->create()->active)->toBeFalse()
        ->and(EventTemplate::factory()->archived()->create()->archived_at)->toBeInstanceOf(CarbonImmutable::class);
});

it('exposes ordered slots role person and template relationships with archival history', function () {
    $event = Event::factory()->create();
    $template = EventTemplate::factory()->create();
    $role = Role::factory()->ministry(ministryWithRoles()->id)->create();
    $later = EventSlot::factory()->for($event)->withRole($role)->create(['sort_order' => 2, 'archived_at' => now()]);
    $first = EventSlot::factory()->for($event)->create(['sort_order' => 1]);
    $templateSlot = EventTemplateSlot::factory()->for($template, 'template')->withRole($role)->create(['archived_at' => now()]);
    $person = Person::factory()->create();
    $assignment = EventAssignment::factory()->for($first)->for($person)->create();
    EventAssignment::factory()->for($later, 'slot')->for($person)->create();
    EventAssignment::factory()->for($later, 'slot')->create();
    EventAssignment::factory()->for($first, 'slot')->create(['archived_at' => now()]);
    expect($event->slots->modelKeys())->toBe([$first->id, $later->id])
        ->and($later->role->is($role))->toBeTrue()
        ->and($later->resource_type)->toBe(ResourceType::Person)
        ->and($later->archived_at)->toBeInstanceOf(CarbonImmutable::class)
        ->and($template->slots->sole()->is($templateSlot))->toBeTrue()
        ->and($templateSlot->template->is($template))->toBeTrue()
        ->and($templateSlot->role->is($role))->toBeTrue()
        ->and($templateSlot->archived_at)->toBeInstanceOf(CarbonImmutable::class)
        ->and($assignment->person->is($person))->toBeTrue()
        ->and($assignment->slot->is($first))->toBeTrue()
        ->and($first->assignments)->toHaveCount(2)
        ->and($event->assignedPersonIds())->toBe([$person->id]);
});

it('uses calendar morph aliases and reminder kinds', function () {
    expect((new Event)->getMorphClass())->toBe('event')
        ->and((new EventTemplate)->getMorphClass())->toBe('event_template')
        ->and(Relation::getMorphedModel('announcement'))->toBe(Announcement::class)
        ->and(ReminderKind::H24->offset()->totalHours)->toBe(24.0)
        ->and(ReminderKind::H2->offset()->totalHours)->toBe(2.0)
        ->and(ReminderKind::H24->label())->toBe('за сутки')
        ->and(ReminderKind::H2->label())->toBe('за два часа');
    $event = Event::factory()->create();
    $reminder = EventReminder::query()->create(['event_id' => $event->id, 'kind' => ReminderKind::H24, 'sent_at' => now()]);
    expect($reminder->kind)->toBe(ReminderKind::H24)
        ->and($reminder->sent_at)->toBeInstanceOf(CarbonImmutable::class)
        ->and($reminder->event->is($event))->toBeTrue();
});

it('restricts physical deletion of referenced calendar history', function () {
    $slot = EventSlot::factory()->create();
    expect(fn () => DB::table('events')->where('id', $slot->event_id)->delete())->toThrow(QueryException::class);
});
