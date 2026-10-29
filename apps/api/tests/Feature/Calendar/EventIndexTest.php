<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Calendar\Http\Queries\EventIndexQuery;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('lists overlapping events in start order using inclusive church dates', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'Asia/Vladivostok']);
    actingAsUser();
    $utc = fn (string $time): CarbonImmutable => CarbonImmutable::parse($time, 'UTC');
    $late = Event::factory()->between($utc('2026-11-09 13:59:59'), $utc('2026-11-09 14:30'))->create();
    $overlap = Event::factory()->between($utc('2026-11-08 12:00'), $utc('2026-11-08 15:00'))->create();
    Event::factory()->between($utc('2026-11-08 12:00'), $utc('2026-11-08 14:00'))->create();
    Event::factory()->between($utc('2026-11-09 14:00'), $utc('2026-11-09 15:00'))->create();

    $this->getJson('/api/v1/events?from=2026-11-09&to=2026-11-09')->assertOk()->assertJsonCount(2, 'data')
        ->assertJsonPath('data.0.id', $overlap->id)->assertJsonPath('data.1.id', $late->id);
});

it('uses church midnight across a daylight saving transition', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'America/New_York']);
    actingAsUser();
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-02 04:30Z'), CarbonImmutable::parse('2026-11-02 05:00Z'))->create();
    $this->getJson('/api/v1/events?from=2026-11-01&to=2026-11-01')->assertOk()->assertJsonPath('data.0.id', $event->id);
    $this->getJson('/api/v1/events?from=2026-11-02&to=2026-11-02')->assertOk()->assertJsonCount(0, 'data');
});

it('defaults to four weeks from today in church time', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'Asia/Vladivostok']);
    $this->travelTo(CarbonImmutable::parse('2026-11-08 20:00Z'));
    actingAsUser();
    $first = Event::factory()->between(CarbonImmutable::parse('2026-11-08 19:00Z'), CarbonImmutable::parse('2026-11-08 21:00Z'))->create();
    Event::factory()->between(CarbonImmutable::parse('2026-11-08 12:00Z'), CarbonImmutable::parse('2026-11-08 13:00Z'))->create();
    Event::factory()->between(CarbonImmutable::now()->addDays(40), CarbonImmutable::now()->addDays(40)->addHour())->create();
    $this->getJson('/api/v1/events')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $first->id);
});

it('validates date scope and pagination input', function (string $query, string $field) {
    actingAsUser();
    $this->getJson('/api/v1/events?'.$query)->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    ['from=2026-01-01&to=2026-06-01', 'to'],
    ['from=2026-01-01&to=2026-04-04', 'to'],
    ['from=2026-11-08&to=2026-11-07', 'to'],
    ['from=2026-02-30', 'from'], ['from=tomorrow', 'from'], ['to=', 'to'],
    ['scope=ministry:invalid', 'scope'], ['scope=all', 'scope'], ['scope=', 'scope'],
    ['scope=MINE', 'scope'],
    ['per_page=201', 'per_page'], ['per_page=0', 'per_page'], ['page=0', 'page'],
]);

it('accepts 93 calendar dates and keeps the internal query usable for 210 days', function () {
    $user = actingAsUser();
    $event = Event::factory()->between(CarbonImmutable::parse('2026-06-01 07:00Z'), CarbonImmutable::parse('2026-06-01 09:00Z'))->create();
    $this->getJson('/api/v1/events?from=2026-01-01&to=2026-04-03')->assertOk();
    expect(app(EventIndexQuery::class)->for($user, CarbonImmutable::parse('2026-01-01'), CarbonImmutable::parse('2026-07-29'), 'church')->pluck('id')->all())->toBe([$event->id]);
});

it('scopes to a ministry without broadening unknown or invisible ministries', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    actingAsUserWith([Permission::MinistriesViewAll]);
    $event = Event::factory()->ministry($ministry)->create();
    Event::factory()->ministry($other)->create();
    Event::factory()->create();
    $this->getJson("/api/v1/events?scope=ministry:{$ministry->id}")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $event->id);
    $this->getJson('/api/v1/events?scope=ministry:01K00000000000000000000000')->assertOk()->assertJsonCount(0, 'data');
    app('auth')->forgetGuards();
    actingAsUser();
    $this->getJson("/api/v1/events?scope=ministry:{$ministry->id}")->assertOk()->assertJsonCount(0, 'data');
});

it('paginates and preserves date and scope filters in links', function () {
    actingAsUser();
    Event::factory()->count(3)->create();
    $from = CarbonImmutable::now()->toDateString();
    $to = CarbonImmutable::now()->addDays(7)->toDateString();
    $response = $this->getJson("/api/v1/events?from={$from}&to={$to}&scope=church&per_page=2")->assertOk()
        ->assertJsonCount(2, 'data')->assertJsonPath('meta.total', 3);
    parse_str(parse_url($response->json('links.next'), PHP_URL_QUERY), $parameters);
    expect($parameters)->toBe(['from' => $from, 'to' => $to, 'scope' => 'church', 'per_page' => '2', 'page' => '2']);
    $this->getJson('/api/v1/events?per_page=200')->assertOk();
});

it('eager loads active event cards without per-event relationship queries and redacts people', function () {
    $viewer = actingAsUser();
    $person = Person::factory()->create();
    foreach (range(1, 3) as $index) {
        $event = Event::factory()->create();
        $slot = EventSlot::factory()->for($event)->create();
        EventAssignment::factory()->for($slot)->for($person)->create();
        EventAssignment::factory()->for($slot)->for($viewer->person)->create(['archived_at' => now()]);
        EventSlot::factory()->for($event)->create(['archived_at' => now()]);
    }
    // Warm the shared permission cache before measuring event relationships.
    app(PermissionResolver::class)->for($viewer);
    DB::enableQueryLog();
    $response = $this->getJson('/api/v1/events')->assertOk()->assertJsonCount(3, 'data');
    $queries = collect(DB::getQueryLog());
    DB::disableQueryLog();
    foreach ($response->json('data') as $event) {
        expect($event['slots'])->toHaveCount(1)
            ->and($event['slots'][0]['assignments'])->toHaveCount(1)
            ->and($event['slots'][0]['assignments'][0]['person']['full_name'])->toBeNull()
            ->and($event['slots'][0]['assignments'][0]['person']['photo_thumb_url'])->toBeNull();
    }
    expect($queries->filter(fn (array $query): bool => str_starts_with($query['query'], 'select * from "event_slots"'))->count())->toBe(1)
        ->and($queries->filter(fn (array $query): bool => str_starts_with($query['query'], 'select * from "event_assignments"'))->count())->toBe(1);
});
