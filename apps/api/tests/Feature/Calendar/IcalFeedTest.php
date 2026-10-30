<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-11-01 00:00Z'));
    config(['app.url' => 'https://church.example.test:8443']);
});

function icalAssign(User $user, Event $event, string $label = 'Звук', array $attributes = [], array $slotAttributes = []): EventAssignment
{
    $slot = EventSlot::factory()->for($event)->create(['label' => $label, ...$slotAttributes]);

    return EventAssignment::factory()->for($slot)->for($user->person)->create($attributes);
}

function unfoldIcal(string $body): string
{
    return preg_replace('/\r\n[ \t]/', '', $body);
}

it('rejects unknown tokens disabled accounts and archived people', function () {
    $this->get('/api/v1/calendar/feed/unknown.ics')->assertNotFound();
    $disabled = User::factory()->create(['disabled_at' => now()]);
    $archived = User::factory()->for(Person::factory()->create(['archived_at' => now()]))->create();

    foreach ([$disabled, $archived] as $user) {
        $this->get("/api/v1/calendar/feed/{$user->ical_token}.ics")->assertNotFound();
    }
});

it('serves a private guest calendar with one vevent per assigned scheduled event', function () {
    app(ChurchSettings::class)->put(['church.name' => 'Наша церковь']);
    $user = User::factory()->create();
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08 10:00+03:00'), CarbonImmutable::parse('2026-11-08 12:00+03:00'))
        ->create(['title' => 'Воскресное служение', 'location' => 'Зал']);
    icalAssign($user, $event, 'Звук');
    icalAssign($user, $event, 'Свет');
    icalAssign(User::factory()->create(), $event, 'Чужой слот');
    icalAssign($user, $event, 'Снятое назначение', ['archived_at' => now()]);
    icalAssign($user, $event, 'Архивный слот', [], ['archived_at' => now()]);
    icalAssign($user, Event::factory()->cancelled()->create());
    icalAssign($user, Event::factory()->create(['archived_at' => now()]));
    icalAssign($user, Event::factory()->create(), 'Снято', ['archived_at' => now()]);
    icalAssign($user, Event::factory()->create(), 'Архив', [], ['archived_at' => now()]);
    Event::factory()->create();

    $response = $this->get("/api/v1/calendar/feed/{$user->ical_token}.ics")->assertOk()
        ->assertHeader('Content-Type', 'text/calendar; charset=UTF-8');
    $body = unfoldIcal($response->getContent());

    expect(substr_count($body, 'BEGIN:VEVENT'))->toBe(1)
        ->and($body)->toContain('BEGIN:VCALENDAR', 'X-WR-CALNAME:Наша церковь', 'SUMMARY:Воскресное служение', 'LOCATION:Зал',
            'DTSTART:20261108T070000Z', 'DTEND:20261108T090000Z', "UID:event-{$event->id}@church.example.test", 'DESCRIPTION:Слоты: Звук\\, Свет')
        ->and($body)->not->toContain('Чужой слот', 'Снятое назначение', 'Архивный слот', 'TZID=')
        ->and($response->headers->get('Cache-Control'))->toContain('private', 'no-store');
    $this->assertGuest();
});

it('escapes calendar text without injecting properties and keeps unicode', function () {
    $user = User::factory()->create();
    $event = Event::factory()->create(['title' => "Служение, дети; хор\\свет\nНовая строка", 'location' => "Зал, 1; этаж\nВход"]);
    icalAssign($user, $event, "Звук, свет; хор\\пульт\nLOCATION:Подмена");

    $body = unfoldIcal($this->get("/api/v1/calendar/feed/{$user->ical_token}.ics")->assertOk()->getContent());

    expect($body)->toContain('SUMMARY:Служение\\, дети\\; хор\\\\свет\\nНовая строка',
        'LOCATION:Зал\\, 1\\; этаж\\nВход', 'DESCRIPTION:Слоты: Звук\\, свет\\; хор\\\\пульт\\nLOCATION:Подмена')
        ->and(substr_count($body, "\r\nLOCATION:"))->toBe(1);
});

it('uses church calendar date boundaries for the whole uncapped feed horizon', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'Asia/Vladivostok']);
    // Church today is November 9: from October 10 through May 8, inclusive.
    $this->travelTo(CarbonImmutable::parse('2026-11-08 20:00Z'));
    $user = User::factory()->create();
    $events = [];
    foreach ([
        ['2026-10-09 13:00Z', '2026-10-09 14:00Z', false],
        ['2026-10-09 13:59Z', '2026-10-09 14:01Z', true],
        ['2027-05-08 13:59Z', '2027-05-08 15:00Z', true],
        ['2027-05-08 14:00Z', '2027-05-08 15:00Z', false],
    ] as [$start, $end, $included]) {
        $event = Event::factory()->between(CarbonImmutable::parse($start), CarbonImmutable::parse($end))->create();
        icalAssign($user, $event);
        $events[] = [$event, $included];
    }
    $body = $this->get("/api/v1/calendar/feed/{$user->ical_token}.ics")->assertOk()->getContent();

    expect(substr_count($body, 'BEGIN:VEVENT'))->toBe(2);
    foreach ($events as [$event, $included]) {
        expect(str_contains($body, "UID:event-{$event->id}@"))->toBe($included);
    }
});

it('does not truncate the feed at the public event pagination limit', function () {
    $user = User::factory()->create();
    foreach (Event::factory()->count(201)->create() as $event) {
        icalAssign($user, $event);
    }

    $body = $this->get("/api/v1/calendar/feed/{$user->ical_token}.ics")->assertOk()->getContent();

    expect(substr_count($body, 'BEGIN:VEVENT'))->toBe(201);
});

it('resolves the account only from the token even with another authenticated session', function (bool $disabledViewer) {
    $owner = User::factory()->create();
    $viewer = actingAsUser(null, ['disabled_at' => $disabledViewer ? now() : null]);
    $ownEvent = Event::factory()->create();
    $viewerEvent = Event::factory()->create();
    icalAssign($owner, $ownEvent);
    icalAssign($viewer, $viewerEvent);

    $body = $this->get("/api/v1/calendar/feed/{$owner->ical_token}.ics")->assertOk()->getContent();

    expect($body)->toContain("UID:event-{$ownEvent->id}@")->not->toContain("UID:event-{$viewerEvent->id}@");
    $this->get('/api/v1/calendar/feed/unknown.ics')->assertNotFound();
})->with([false, true]);

it('rotates only the current account token and invalidates the old url immediately', function () {
    $user = actingAsUser();
    $old = $user->ical_token;
    $other = User::factory()->create();
    $event = Event::factory()->create();
    icalAssign($user, $event);
    $auditCount = AuditEntry::query()->count();

    $before = $this->get("/api/v1/calendar/feed/{$old}.ics")->assertOk()->getContent();
    $url = $this->postJson('/api/v1/me/ical-token/rotate')->assertOk()->json('data.ical_url');
    $new = $user->fresh()->ical_token;

    expect($new)->toHaveLength(64)->not->toBe($old)
        ->and($url)->toBe(url("/api/v1/calendar/feed/{$new}.ics"))
        ->and($other->fresh()->ical_token)->toBe($other->ical_token)
        ->and(AuditEntry::query()->count())->toBe($auditCount);
    $this->get("/api/v1/calendar/feed/{$old}.ics")->assertNotFound();
    $after = $this->get("/api/v1/calendar/feed/{$new}.ics")->assertOk()->getContent();
    expect($before)->toContain("UID:event-{$event->id}@church.example.test")
        ->and($after)->toContain("UID:event-{$event->id}@church.example.test");
    $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('user.ical_url', $url);
    $this->assertAuthenticatedAs($user, 'web');
});

it('requires authentication for rotation', function () {
    $this->postJson('/api/v1/me/ical-token/rotate')->assertUnauthorized();
});

it('includes the feed url in the existing me envelope', function () {
    $user = actingAsUser();

    $this->getJson('/api/v1/auth/me')->assertOk()
        ->assertJsonPath('user.ical_url', url("/api/v1/calendar/feed/{$user->ical_token}.ics"))
        ->assertJsonPath('user.id', $user->id)->assertJsonPath('person.id', $user->person_id)
        ->assertJsonMissingPath('user.ical_token');
});

it('throttles token feed requests without requiring a session', function () {
    $user = User::factory()->create();
    $this->withServerVariables(['REMOTE_ADDR' => '192.0.2.14']);
    foreach (range(1, 60) as $attempt) {
        $this->get("/api/v1/calendar/feed/{$user->ical_token}.ics")->assertOk();
    }

    $this->get("/api/v1/calendar/feed/{$user->ical_token}.ics")->assertStatus(429)->assertHeader('Retry-After');
});

it('grants personal assignment visibility consistently and removes it when archived', function (string $archive) {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    $event = Event::factory()->ministry($ministry)->create();
    $unassigned = Event::factory()->ministry($ministry)->create();
    $assignment = icalAssign($user, $event);
    expect(app(EventAccess::class)->canView($user, $event))->toBeTrue()
        ->and(app(EventAccess::class)->canView($user, $unassigned))->toBeFalse();
    $this->getJson("/api/v1/events/{$event->id}")->assertOk();
    $this->getJson("/api/v1/events/{$unassigned->id}")->assertForbidden();
    foreach (['church', 'mine'] as $scope) {
        $this->getJson("/api/v1/events?scope={$scope}")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $event->id);
    }
    expect($this->get("/api/v1/calendar/feed/{$user->ical_token}.ics")->assertOk()->getContent())->toContain("UID:event-{$event->id}@");

    match ($archive) {
        'assignment' => $assignment->update(['archived_at' => now()]),
        'slot' => $assignment->slot->update(['archived_at' => now()]),
        'event' => $event->update(['archived_at' => now()]),
    };
    expect(app(EventAccess::class)->canView($user, $event->fresh()))->toBeFalse();
    $this->getJson("/api/v1/events/{$event->id}")->assertForbidden();
    foreach (['church', 'mine'] as $scope) {
        $this->getJson("/api/v1/events?scope={$scope}")->assertOk()->assertJsonCount(0, 'data');
    }
    expect($this->get("/api/v1/calendar/feed/{$user->ical_token}.ics")->assertOk()->getContent())->not->toContain('BEGIN:VEVENT');
})->with(['assignment', 'slot', 'event']);

it('keeps slot role access under assigned visibility instead of granting ministry events', function () {
    $requiredMinistry = ministryWithRoles();
    $owner = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    $role = Role::factory()->ministry($requiredMinistry->id)->withPermissions([Permission::SlotsAssign])->create();
    memberOf($requiredMinistry, $user->person, [$role->id]);
    $event = Event::factory()->ministry($owner)->create();
    EventSlot::factory()->for($event)->withRole($role)->create();

    expect(app(EventAccess::class)->canView($user, $event))->toBeFalse();
    $this->getJson("/api/v1/events/{$event->id}")->assertForbidden();
    expect($this->get("/api/v1/calendar/feed/{$user->ical_token}.ics")->assertOk()->getContent())->not->toContain('BEGIN:VEVENT');
});
