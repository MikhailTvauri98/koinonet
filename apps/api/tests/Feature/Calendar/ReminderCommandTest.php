<?php

declare(strict_types=1);

use App\Modules\Calendar\Actions\RecordReminder;
use App\Modules\Calendar\Events\EventReminderDue;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventReminder;
use App\Modules\Calendar\ReminderKind;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event as EventBus;
use Illuminate\Support\Facades\Schedule;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-11-07T10:00:00.750Z'));
    EventBus::fake([EventReminderDue::class]);
});

it('uses the inclusive second-precision lower boundary and exclusive upper boundary for each reminder', function (string $kind, string $lower, string $upper) {
    $from = CarbonImmutable::parse($lower);
    $to = CarbonImmutable::parse($upper);
    $included = collect([$from, $to->subSecond()])->map(fn ($start) => Event::factory()->between($start, $start->addHour())->create());
    foreach ([$from->subSecond(), $to] as $start) {
        Event::factory()->between($start, $start->addHour())->create();
    }

    $this->artisan('calendar:send-reminders')->assertSuccessful();
    $this->artisan('calendar:send-reminders')->assertSuccessful();

    expect(EventReminder::query()->orderBy('event_id')->pluck('event_id')->all())->toBe($included->pluck('id')->sort()->values()->all())
        ->and(EventReminder::query()->toBase()->pluck('kind')->all())->toBe([$kind, $kind]);
    expect(EventReminder::query()->get()->every(fn ($reminder) => $reminder->sent_at->toISOString() === '2026-11-07T10:00:00.000000Z'))->toBeTrue();
    EventBus::assertDispatchedTimes(EventReminderDue::class, 2);
    foreach ($included as $event) {
        EventBus::assertDispatched(EventReminderDue::class, fn ($due) => $due->eventId === $event->id && $due->kind->value === $kind);
    }
})->with([
    ['h24', '2026-11-08T10:00:00Z', '2026-11-08T10:05:00Z'],
    ['h2', '2026-11-07T12:00:00Z', '2026-11-07T12:05:00Z'],
]);

it('uses only configured reminder kinds including no reminders', function (array $offsets, array $expected) {
    app(ChurchSettings::class)->put(['calendar.reminder_offsets' => $offsets]);
    Event::factory()->between(CarbonImmutable::parse('2026-11-08T10:02:00Z'), CarbonImmutable::parse('2026-11-08T12:00:00Z'))->create();
    Event::factory()->between(CarbonImmutable::parse('2026-11-07T12:02:00Z'), CarbonImmutable::parse('2026-11-07T14:00:00Z'))->create();

    $this->artisan('calendar:send-reminders')->assertSuccessful();

    expect(EventReminder::query()->orderBy('kind')->toBase()->pluck('kind')->all())->toBe($expected);
    EventBus::assertDispatchedTimes(EventReminderDue::class, count($expected));
})->with([[[], []], [['h2'], ['h2']], [['h24'], ['h24']]]);

it('keeps a single clock and settings snapshot for all kinds even when execution crosses a boundary', function () {
    Event::factory()->between(CarbonImmutable::parse('2026-11-08T10:00:00Z'), CarbonImmutable::parse('2026-11-08T12:00:00Z'))->create();
    Event::factory()->between(CarbonImmutable::parse('2026-11-07T12:00:00Z'), CarbonImmutable::parse('2026-11-07T14:00:00Z'))->create();
    $advanced = false;
    DB::listen(function (QueryExecuted $query) use (&$advanced): void {
        if (! $advanced && str_contains($query->sql, 'insert into "event_reminders"')) {
            $advanced = true;
            $this->travelTo(CarbonImmutable::parse('2026-11-07T10:06:00Z'));
            app(ChurchSettings::class)->put(['calendar.reminder_offsets' => []]);
        }
    });

    $this->artisan('calendar:send-reminders')->assertSuccessful();

    expect($advanced)->toBeTrue()->and(EventReminder::query()->orderBy('kind')->toBase()->pluck('kind')->all())->toBe(['h2', 'h24'])
        ->and(EventReminder::query()->get()->every(fn ($reminder) => $reminder->sent_at->toISOString() === '2026-11-07T10:00:00.000000Z'))->toBeTrue();
});

it('skips cancelled and archived candidates', function (array $attributes) {
    Event::factory()->between(CarbonImmutable::parse('2026-11-08T10:02:00Z'), CarbonImmutable::parse('2026-11-08T12:00:00Z'))->create($attributes);

    $this->artisan('calendar:send-reminders')->assertSuccessful();

    expect(EventReminder::query()->count())->toBe(0);
    EventBus::assertNotDispatched(EventReminderDue::class);
})->with([[['status' => 'cancelled', 'cancelled_at' => '2026-11-07T09:00:00Z']], [['archived_at' => '2026-11-07T09:00:00Z']]]);

it('rechecks stale event status archive time and existence before recording', function (string $state) {
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08T10:02:00Z'), CarbonImmutable::parse('2026-11-08T12:00:00Z'))->create();
    match ($state) {
        'cancelled' => Event::query()->whereKey($event->id)->update(['status' => 'cancelled']),
        'archived' => Event::query()->whereKey($event->id)->update(['archived_at' => now()]),
        'moved before' => Event::query()->whereKey($event->id)->update(['starts_at' => '2026-11-08T09:59:59Z']),
        'moved after' => Event::query()->whereKey($event->id)->update(['starts_at' => '2026-11-08T10:05:00Z']),
        'missing' => $event->id = (string) str()->ulid(),
    };

    app(RecordReminder::class)->handle($event, ReminderKind::H24);

    expect(EventReminder::query()->count())->toBe(0);
    EventBus::assertNotDispatched(EventReminderDue::class);
})->with(['cancelled', 'archived', 'moved before', 'moved after', 'missing']);

it('atomically records one row and event when called repeatedly with a stale instance', function () {
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08T10:00:00Z'), CarbonImmutable::parse('2026-11-08T12:00:00Z'))->create();
    app(RecordReminder::class)->handle($event, ReminderKind::H24);
    $before = EventReminder::query()->sole()->getAttributes();
    app(RecordReminder::class)->handle($event, ReminderKind::H24);

    expect(EventReminder::query()->sole()->getAttributes())->toBe($before);
    EventBus::assertDispatchedTimes(EventReminderDue::class, 1);
});

it('schedules reminders every five minutes without overlap and preserves prior jobs', function () {
    $events = collect(Schedule::events());
    $reminders = $events->first(fn ($event) => str_contains((string) $event->command, 'calendar:send-reminders'));
    expect($reminders)->not->toBeNull()->and($reminders->expression)->toBe('*/5 * * * *')->and($reminders->withoutOverlapping)->toBeTrue()
        ->and($events->first(fn ($event) => str_contains((string) $event->command, 'calendar:materialize'))->expression)->toBe('0 3 * * *')
        ->and($events->contains(fn ($event) => str_contains((string) $event->command, 'media:prune')))->toBeTrue();
});
