<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use Carbon\CarbonImmutable;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('documents boolean role flags and nullable hidden conflict fields in the schema', function () {
    $schema = app(Generator::class)();
    $candidate = $schema['components']['schemas']['CandidateResource']['properties'];
    expect($candidate['has_role']['type'])->toBe('boolean')
        ->and($candidate['conflicts']['type'])->toBe('array');
    $conflict = $candidate['conflicts']['items']['properties'];
    foreach (['event_id', 'starts_at', 'ends_at'] as $field) {
        expect($conflict[$field]['type'])->toBe(['string', 'null']);
    }
});

it('lists members holding the required role with their conflicts', function () {
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    $free = Person::factory()->create(['last_name' => 'Свободная']);
    $busy = Person::factory()->create(['last_name' => 'Занятая']);
    $notSinger = Person::factory()->create();
    memberOf($ministry, $free, [$vocalist->id]);
    memberOf($ministry, $busy, [$vocalist->id]);
    memberOf($ministry, $notSinger);

    $target = Event::factory()->between(CarbonImmutable::parse('2026-11-08 10:00'), CarbonImmutable::parse('2026-11-08 12:00'))->create();
    $slot = EventSlot::factory()->for($target)->withRole($vocalist)->create();
    $other = Event::factory()->between(CarbonImmutable::parse('2026-11-08 11:00'), CarbonImmutable::parse('2026-11-08 13:00'))->create(['title' => 'Репетиция']);
    EventAssignment::factory()->for(EventSlot::factory()->for($other)->create())->for($busy)->create();

    actingAsUserWith([Permission::CalendarChurchManage, Permission::PeopleView]);
    $data = collect($this->getJson("/api/v1/slots/{$slot->id}/candidates")->assertOk()->json('data'));

    expect($data->pluck('person.id')->all())->toEqualCanonicalizing([$free->id, $busy->id])
        ->and($data->firstWhere('person.id', $busy->id)['conflicts'][0]['title'])->toBe('Репетиция')
        ->and($data->firstWhere('person.id', $free->id)['conflicts'])->toBe([]);
});

it('searches active people for a free slot', function () {
    actingAsUserWith([Permission::CalendarChurchManage, Permission::PeopleView]);
    Person::factory()->create(['last_name' => 'Прокопенко', 'first_name' => 'Мария']);
    Person::factory()->archived()->create(['last_name' => 'Прокопенко', 'first_name' => 'Анна']);
    $slot = EventSlot::factory()->create();

    $data = $this->getJson("/api/v1/slots/{$slot->id}/candidates?search=прокоп")->assertOk()->json('data');

    expect($data)->toHaveCount(1)->and($data[0]['person']['full_name'])->toContain('Мария');
});

it('requires two characters to search a free slot', function () {
    actingAsUserWith([Permission::CalendarChurchManage, Permission::PeopleView]);
    $slot = EventSlot::factory()->create();

    $this->getJson("/api/v1/slots/{$slot->id}/candidates?search=п")->assertOk()->assertJsonCount(0, 'data');
});

it('denies candidates to someone who cannot fill the slot', function () {
    actingAsUser();
    $slot = EventSlot::factory()->create();

    $this->getJson("/api/v1/slots/{$slot->id}/candidates")->assertForbidden();
});

it('limits free search to twenty results and requires filling permission for free slots', function () {
    actingAsUserWith([Permission::CalendarChurchManage, Permission::PeopleView]);
    Person::factory()->count(25)->create(['last_name' => 'Прокопенко']);
    $slot = EventSlot::factory()->create();
    $this->getJson("/api/v1/slots/{$slot->id}/candidates?search=прокоп")->assertOk()->assertJsonCount(20, 'data')->assertJsonPath('data.0.has_role', false);
    $this->getJson("/api/v1/slots/{$slot->id}/candidates")->assertOk()->assertJsonCount(20, 'data');
    app('auth')->forgetGuards();
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);
    $this->getJson("/api/v1/slots/{$slot->id}/candidates?search=прокоп")->assertForbidden();
});

it('previews the stable first twenty active people for an empty free search', function () {
    $actor = actingAsUserWith([Permission::CalendarChurchManage, Permission::PeopleView]);
    $actor->person->update(['last_name' => 'Яяя']);
    $people = collect(range(22, 1))->map(fn ($number) => Person::factory()->create([
        'last_name' => sprintf('А%02d', $number), 'first_name' => 'Анна',
    ]));
    Person::factory()->archived()->create(['last_name' => 'А00']);
    $slot = EventSlot::factory()->create();
    $expected = $people->sortBy('last_name')->take(20)->pluck('id')->values()->all();

    foreach (['', '?search=', '?search=%20%20'] as $query) {
        $data = $this->getJson("/api/v1/slots/{$slot->id}/candidates{$query}")->assertOk()->json('data');
        expect(array_column(array_column($data, 'person'), 'id'))->toBe($expected);
    }
});

it('previews only the viewer without people view', function () {
    $actor = actingAsUserWith([Permission::CalendarChurchManage]);
    Person::factory()->create(['last_name' => 'Чужое имя']);
    $slot = EventSlot::factory()->create();

    $this->getJson("/api/v1/slots/{$slot->id}/candidates")->assertOk()->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.person.id', $actor->person_id)
        ->assertJsonPath('data.0.person.full_name', $actor->person->fullName())
        ->assertJsonPath('data.0.person.photo_thumb_url', null);
    $actor->person->update(['archived_at' => now()]);
    $this->getJson("/api/v1/slots/{$slot->id}/candidates")->assertOk()->assertJsonCount(0, 'data');
});

it('redacts candidate identities and hidden conflict details but keeps the warning', function () {
    $actor = actingAsUserWith([Permission::CalendarChurchManage]);
    $person = Person::factory()->create(['last_name' => 'Прокопенко']);
    $ministry = ministryWithRoles();
    memberOf($ministry, $person);
    $hidden = Event::factory()->ministry(ministryWithRoles('Закрытое'))->create(['visibility' => 'assigned', 'title' => 'Скрытое название']);
    EventAssignment::factory()->for(EventSlot::factory()->for($hidden)->create())->for($person)->create();
    $slot = EventSlot::factory()->withRole(Role::query()->findOrFail($ministry->default_role_id))->for(Event::factory()->create(['starts_at' => $hidden->starts_at, 'ends_at' => $hidden->ends_at]))->create();
    $this->getJson("/api/v1/slots/{$slot->id}/candidates?search=прокоп")->assertOk()
        ->assertJsonPath('data.0.person.full_name', null)->assertJsonPath('data.0.person.photo_thumb_url', null)
        ->assertJsonPath('data.0.conflicts.0.event_id', null)->assertJsonPath('data.0.conflicts.0.title', 'Пересечение с недоступным событием')
        ->assertJsonPath('data.0.conflicts.0.starts_at', null)->assertJsonPath('data.0.conflicts.0.ends_at', null);
    $selfSlot = EventSlot::factory()->create();
    $this->getJson("/api/v1/slots/{$selfSlot->id}/candidates?search=".urlencode($actor->person->last_name))->assertOk()
        ->assertJsonPath('data.0.person.id', $actor->person_id)->assertJsonPath('data.0.person.full_name', $actor->person->fullName());
});

it('cannot infer another person identity through free slot name searches', function () {
    $actor = actingAsUserWith([Permission::CalendarChurchManage]);
    Person::factory()->create(['last_name' => 'Прокопенко']);
    $slot = EventSlot::factory()->create();
    $this->getJson("/api/v1/slots/{$slot->id}/candidates?search=прокоп")->assertOk()->assertJsonCount(0, 'data');
    $this->getJson("/api/v1/slots/{$slot->id}/candidates?search=".urlencode($actor->person->last_name))->assertOk()
        ->assertJsonPath('data.0.person.id', $actor->person_id)->assertJsonPath('data.0.person.full_name', $actor->person->fullName());
});

it('excludes archived role candidates and unavailable slots', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    memberOf($ministry, $person, [$ministry->default_role_id]);
    $person->update(['archived_at' => now()]);
    $slot = EventSlot::factory()->withRole(Role::query()->findOrFail($ministry->default_role_id))->create();
    $this->getJson("/api/v1/slots/{$slot->id}/candidates")->assertOk()->assertJsonCount(0, 'data');
    $slot->event->update(['status' => 'cancelled', 'cancelled_at' => now()]);
    $this->getJson("/api/v1/slots/{$slot->id}/candidates")->assertForbidden();
    $slot->update(['archived_at' => now()]);
    $this->getJson("/api/v1/slots/{$slot->id}/candidates")->assertNotFound();
});

it('keeps inaccessible conflict details hidden in the free preview', function () {
    $actor = actingAsUserWith([Permission::CalendarChurchManage, Permission::PeopleView]);
    $actor->person->update(['last_name' => 'Яяя']);
    $person = Person::factory()->create(['last_name' => 'Ааа']);
    $hidden = Event::factory()->ministry(ministryWithRoles('Закрытое'))->create(['visibility' => 'assigned', 'title' => 'Скрытое название']);
    EventAssignment::factory()->for(EventSlot::factory()->for($hidden)->create())->for($person)->create();
    $slot = EventSlot::factory()->for(Event::factory()->create(['starts_at' => $hidden->starts_at, 'ends_at' => $hidden->ends_at]))->create();

    $this->getJson("/api/v1/slots/{$slot->id}/candidates")->assertOk()
        ->assertJsonPath('data.0.person.id', $person->id)
        ->assertJsonPath('data.0.conflicts.0.event_id', null)
        ->assertJsonPath('data.0.conflicts.0.title', 'Пересечение с недоступным событием')
        ->assertJsonPath('data.0.conflicts.0.starts_at', null)
        ->assertJsonPath('data.0.conflicts.0.ends_at', null);
});
