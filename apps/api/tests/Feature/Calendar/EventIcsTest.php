<?php

declare(strict_types=1);

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->travelTo(CarbonImmutable::parse('2026-11-01 00:00Z'));
    config(['app.url' => 'https://church.example.test:8443']);
});

function icsAssign(User $user, Event $event, string $label): void
{
    $slot = EventSlot::factory()->for($event)->create(['label' => $label]);
    EventAssignment::factory()->for($slot)->for($user->person)->create();
}

it('downloads a single event with description and own slots', function () {
    $user = actingAsUser();
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08 10:00+03:00'), CarbonImmutable::parse('2026-11-08 12:00+03:00'))
        ->create(['title' => 'Воскресное служение', 'location' => 'Зал', 'description' => 'Приходите вовремя']);
    icsAssign($user, $event, 'Учитель воскресной школы');
    icsAssign(User::factory()->create(), $event, 'Чужой слот');

    $response = $this->get("/api/v1/events/{$event->id}/ics")->assertOk()
        ->assertHeader('Content-Type', 'text/calendar; charset=UTF-8')
        ->assertHeader('Content-Disposition', "attachment; filename=\"event-{$event->id}.ics\"");
    $body = unfoldIcal($response->getContent());

    expect(substr_count($body, 'BEGIN:VEVENT'))->toBe(1)
        ->and($body)->toContain('SUMMARY:Воскресное служение', 'LOCATION:Зал', 'DTSTART:20261108T070000Z', 'DTEND:20261108T090000Z',
            "UID:event-{$event->id}@church.example.test", 'DESCRIPTION:Приходите вовремя\nСлоты: Учитель воскресной школы')
        ->and($body)->not->toContain('Чужой слот', 'STATUS:CANCELLED');
});

it('refuses the file to someone who cannot view the event', function () {
    $ministry = ministryWithRoles();
    actingAsUser();
    $event = Event::factory()->ministry($ministry)->create();

    $status = $this->getJson("/api/v1/events/{$event->id}")->assertForbidden()->status();
    $this->get("/api/v1/events/{$event->id}/ics")->assertStatus($status);
});

it('requires authentication', function () {
    $event = Event::factory()->create();

    $this->getJson("/api/v1/events/{$event->id}/ics")->assertUnauthorized();
});

it('marks a cancelled event as cancelled', function () {
    actingAsUser();
    $event = Event::factory()->cancelled()->create();

    expect($this->get("/api/v1/events/{$event->id}/ics")->assertOk()->getContent())->toContain('STATUS:CANCELLED');
});
