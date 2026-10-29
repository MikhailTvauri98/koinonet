<?php

declare(strict_types=1);

use App\Modules\Calendar\Actions\CreateEventFromTemplate;
use App\Modules\Calendar\Actions\MaterializeTemplate;
use App\Modules\Calendar\Actions\ReplaceTemplateSlots;
use App\Modules\Calendar\Actions\UpdateTemplate;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schedule;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->travelTo(CarbonImmutable::parse('2026-11-02T12:00:00Z'));
    app(ChurchSettings::class)->put(['church.timezone' => 'Europe/Warsaw']);
});

it('materializes eight weeks with only live slots and a system creator', function () {
    $template = EventTemplate::factory()->weekly(7)->create(['start_time' => '10:00', 'duration_minutes' => 120]);
    EventTemplateSlot::factory()->create(['template_id' => $template->id, 'label' => 'Звук', 'required_count' => 2, 'sort_order' => 3]);
    EventTemplateSlot::factory()->create(['template_id' => $template->id, 'archived_at' => now()]);

    $this->artisan('calendar:materialize')->expectsOutputToContain('Создано событий: 8.')->assertSuccessful();

    $events = Event::query()->where('template_id', $template->id)->orderBy('occurrence_date')->get();
    expect($events->map(fn (Event $event): string => $event->occurrence_date->toDateString())->all())
        ->toBe(['2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27'])
        ->and($template->fresh()->generated_until->toDateString())->toBe('2026-12-28');
    foreach ($events as $event) {
        expect($event->created_by_user_id)->toBeNull()->and($event->starts_at->format('H:i:s'))->toBe('09:00:00')
            ->and($event->ends_at->format('H:i:s'))->toBe('11:00:00')->and($event->slots)->toHaveCount(1)
            ->and($event->slots->sole()->only(['label', 'required_count', 'sort_order']))
            ->toBe(['label' => 'Звук', 'required_count' => 2, 'sort_order' => 3]);
    }
});

it('is idempotent with stale template instances and catches up only beyond the completed horizon', function () {
    $template = EventTemplate::factory()->weekly(7)->create();
    $materialize = app(MaterializeTemplate::class);
    expect($materialize->handle($template, CarbonImmutable::parse('2026-11-02', 'Europe/Warsaw')))->toBe(8);
    $before = Event::query()->orderBy('id')->get()->map->getAttributes()->all();
    expect($materialize->handle($template, CarbonImmutable::parse('2026-11-02', 'Europe/Warsaw')))->toBe(0)
        ->and(Event::query()->orderBy('id')->get()->map->getAttributes()->all())->toBe($before)
        ->and($materialize->handle($template, CarbonImmutable::parse('2026-11-09', 'Europe/Warsaw')))->toBe(1)
        ->and(Event::query()->orderByDesc('occurrence_date')->first()->occurrence_date->toDateString())->toBe('2027-01-03')
        ->and($template->fresh()->generated_until->toDateString())->toBe('2027-01-04');
});

it('skips existing scheduled cancelled and archived dates without touching snapshots', function (array $attributes) {
    $template = EventTemplate::factory()->weekly(7)->create();
    $event = app(CreateEventFromTemplate::class)->handle($template, CarbonImmutable::parse('2026-11-08'), null);
    $event->update($attributes);
    $before = $event->fresh()->getAttributes();
    expect(app(MaterializeTemplate::class)->handle($template, CarbonImmutable::parse('2026-11-02', 'Europe/Warsaw')))->toBe(7)
        ->and(Event::query()->count())->toBe(8)->and($event->fresh()->getAttributes())->toBe($before);
})->with([[[]], [['status' => 'cancelled', 'cancelled_at' => '2026-11-01T00:00:00Z']], [['archived_at' => '2026-11-01T00:00:00Z']]]);

it('keeps local start times across a real DST transition and never generates past dates', function () {
    $this->travelTo(CarbonImmutable::parse('2026-10-12T12:00:00Z'));
    EventTemplate::factory()->weekly(7)->create(['start_time' => '10:00']);
    $this->artisan('calendar:materialize')->assertSuccessful();
    $before = Event::query()->whereDate('occurrence_date', '2026-10-18')->sole();
    $after = Event::query()->whereDate('occurrence_date', '2026-10-25')->sole();
    expect($before->starts_at->format('H:i'))->toBe('08:00')->and($after->starts_at->format('H:i'))->toBe('09:00')
        ->and($before->starts_at->setTimezone('Europe/Warsaw')->format('H:i'))->toBe('10:00')
        ->and($after->starts_at->setTimezone('Europe/Warsaw')->format('H:i'))->toBe('10:00')
        ->and(Event::query()->whereDate('occurrence_date', '<', '2026-10-12')->exists())->toBeFalse();
});

it('uses church today and includes the horizon date even when both ends are Sundays', function () {
    $this->travelTo(CarbonImmutable::parse('2026-11-02T01:00:00Z')); // Still Sunday in New York.
    app(ChurchSettings::class)->put(['church.timezone' => 'America/New_York']);
    $template = EventTemplate::factory()->weekly(7)->create();
    $this->artisan('calendar:materialize')->assertSuccessful();
    expect(Event::query()->orderBy('occurrence_date')->get()->map(fn (Event $event): string => $event->occurrence_date->toDateString())->all())
        ->toBe(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29', '2026-12-06', '2026-12-13', '2026-12-20', '2026-12-27'])
        ->and($template->fresh()->generated_until->toDateString())->toBe('2026-12-27');
});

it('rebuilds the completed calendar date in the church timezone before advancing', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'America/New_York', 'calendar.horizon_weeks' => 2]);
    $template = EventTemplate::factory()->weekly(7)->create(['generated_until' => '2026-11-08']);
    expect(app(MaterializeTemplate::class)->handle($template, CarbonImmutable::parse('2026-11-02', 'America/New_York')))->toBe(1)
        ->and(Event::query()->sole()->occurrence_date->toDateString())->toBe('2026-11-15')
        ->and($template->fresh()->generated_until->toDateString())->toBe('2026-11-16');
});

it('does not move the watermark backwards and extends only the uncovered horizon', function () {
    $template = EventTemplate::factory()->weekly(7)->create();
    $today = CarbonImmutable::parse('2026-11-02', 'Europe/Warsaw');
    $materialize = app(MaterializeTemplate::class);
    expect($materialize->handle($template, $today))->toBe(8);
    app(ChurchSettings::class)->put(['calendar.horizon_weeks' => 2]);
    expect($materialize->handle($template, $today))->toBe(0)
        ->and($template->fresh()->generated_until->toDateString())->toBe('2026-12-28');
    app(UpdateTemplate::class)->handle($template, ['recurrence' => ['type' => 'weekly', 'weekday' => 1]]);
    app(ChurchSettings::class)->put(['calendar.horizon_weeks' => 9]);
    expect($materialize->handle($template, $today))->toBe(1)
        ->and(Event::query()->whereDate('occurrence_date', '2026-12-28')->exists())->toBeFalse()
        ->and(Event::query()->whereDate('occurrence_date', '2027-01-04')->exists())->toBeTrue()
        ->and($template->fresh()->generated_until->toDateString())->toBe('2027-01-04');
});

it('rechecks stale templates and skips every ineligible state in the action and command', function (string $state) {
    $ministry = ministryWithRoles();
    $template = EventTemplate::factory()->ministry($ministry)->weekly(7)->create();
    match ($state) {
        'inactive' => EventTemplate::query()->whereKey($template->id)->update(['active' => false]),
        'archived' => EventTemplate::query()->whereKey($template->id)->update(['archived_at' => now()]),
        'no_rule' => EventTemplate::query()->whereKey($template->id)->update(['recurrence' => null]),
        'archived_owner' => $ministry->update(['archived_at' => now()]),
    };
    expect(app(MaterializeTemplate::class)->handle($template, CarbonImmutable::parse('2026-11-02', 'Europe/Warsaw')))->toBe(0);
    $this->artisan('calendar:materialize')->assertSuccessful();
    expect(Event::query()->count())->toBe(0)->and($template->fresh()->generated_until)->toBeNull();
})->with(['inactive', 'archived', 'no_rule', 'archived_owner']);

it('preserves existing snapshots while newly uncovered dates use current template fields and slots', function () {
    app(ChurchSettings::class)->put(['calendar.horizon_weeks' => 1]);
    $template = EventTemplate::factory()->weekly(7)->create(['title' => 'Старое']);
    app(ReplaceTemplateSlots::class)->handle($template, [['label' => 'Старый слот', 'required_count' => 1]]);
    $this->artisan('calendar:materialize')->assertSuccessful();
    $old = Event::query()->sole();
    app(UpdateTemplate::class)->handle($template, ['title' => 'Новое', 'recurrence' => ['type' => 'weekly', 'weekday' => 2]]);
    app(ReplaceTemplateSlots::class)->handle($template, [['label' => 'Новый слот', 'required_count' => 2]]);
    $this->travelTo(CarbonImmutable::parse('2026-11-09T12:00:00Z'));
    $this->artisan('calendar:materialize')->assertSuccessful();
    $new = Event::query()->whereDate('occurrence_date', '2026-11-10')->sole();
    expect($old->fresh()->title)->toBe('Старое')->and($old->slots->sole()->label)->toBe('Старый слот')
        ->and($new->title)->toBe('Новое')->and($new->slots->sole()->label)->toBe('Новый слот')
        ->and($new->slots->sole()->required_count)->toBe(2)->and(Event::query()->count())->toBe(2);
});

it('advances the completed horizon even when it has no occurrence', function () {
    app(ChurchSettings::class)->put(['calendar.horizon_weeks' => 1]);
    $template = EventTemplate::factory()->monthlyNth(5, 7)->create();
    expect(app(MaterializeTemplate::class)->handle($template, CarbonImmutable::parse('2026-11-02', 'Europe/Warsaw')))->toBe(0)
        ->and($template->fresh()->generated_until->toDateString())->toBe('2026-11-09');
});

it('registers daily materialization at three and retains media pruning', function () {
    $events = collect(Schedule::events());
    expect($events->first(fn ($event): bool => str_contains((string) $event->command, 'calendar:materialize'))->expression)->toBe('0 3 * * *')
        ->and($events->contains(fn ($event): bool => str_contains((string) $event->command, 'media:prune')))->toBeTrue();
});
