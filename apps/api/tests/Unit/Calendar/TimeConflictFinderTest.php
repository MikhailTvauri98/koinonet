<?php

declare(strict_types=1);

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\TimeConflictFinder;
use App\Modules\Directory\Models\Person;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

uses(TestCase::class, RefreshDatabase::class);

function assignedEvent(Person $person, string $start, string $end, array $over = []): Event
{
    $event = Event::factory()->between(CarbonImmutable::parse($start), CarbonImmutable::parse($end))->create($over);
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create())->for($person)->create();

    return $event;
}

it('finds an overlapping scheduled event', function () {
    $person = Person::factory()->create();
    $busy = assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00');

    $found = app(TimeConflictFinder::class)->conflictsFor($person->id, CarbonImmutable::parse('2026-11-08 11:00'), CarbonImmutable::parse('2026-11-08 13:00'));

    expect($found->pluck('id')->all())->toBe([$busy->id]);
});

it('treats touching intervals as free', function () {
    $person = Person::factory()->create();
    assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00');

    expect(app(TimeConflictFinder::class)->conflictsFor($person->id, CarbonImmutable::parse('2026-11-08 12:00'), CarbonImmutable::parse('2026-11-08 14:00')))
        ->toBeEmpty();
});

it('ignores cancelled events and other people', function () {
    $person = Person::factory()->create();
    assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00', ['status' => 'cancelled', 'cancelled_at' => now()]);
    assignedEvent(Person::factory()->create(), '2026-11-08 10:00', '2026-11-08 12:00');

    expect(app(TimeConflictFinder::class)->conflictsFor($person->id, CarbonImmutable::parse('2026-11-08 10:30'), CarbonImmutable::parse('2026-11-08 11:00')))
        ->toBeEmpty();
});

it('excludes the event being filled', function () {
    $person = Person::factory()->create();
    $same = assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00');

    expect(app(TimeConflictFinder::class)->conflictsFor($person->id, $same->starts_at, $same->ends_at, $same->id))->toBeEmpty();
});

it('ignores archived events slots and assignments and deduplicates events', function () {
    $person = Person::factory()->create();
    $from = CarbonImmutable::parse('2026-11-08 10:30');
    $to = CarbonImmutable::parse('2026-11-08 11:00');
    assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00', ['archived_at' => now()]);
    $oldSlot = assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00');
    $oldSlot->slots()->update(['archived_at' => now()]);
    $oldAssignment = assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00');
    $oldAssignment->slots()->first()->assignments()->update(['archived_at' => now()]);
    $live = assignedEvent($person, '2026-11-08 10:00', '2026-11-08 12:00');
    EventAssignment::factory()->for(EventSlot::factory()->for($live)->create())->for($person)->create();
    expect(app(TimeConflictFinder::class)->conflictsFor($person->id, $from, $to)->pluck('id')->all())->toBe([$live->id]);
});
