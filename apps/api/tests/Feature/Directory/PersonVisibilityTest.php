<?php

declare(strict_types=1);

use App\Modules\Access\Contracts\MinistryPermissionSource;
use App\Modules\Access\Permission;
use App\Modules\Directory\Contracts\SharedMinistryFinder;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Directory\PersonVisibility;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

it('hides contacts from a viewer with only people.view', function () {
    actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => false]);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonMissingPath('data.contacts');
});

it('shows contacts with people.view_contacts', function () {
    actingAsUserWith([Permission::PeopleView, Permission::PeopleViewContacts]);
    $person = Person::factory()->create(['phone' => '+79123456789']);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonPath('data.contacts.phone', '+79123456789');
});

it('shows contacts the person made public', function () {
    actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => true]);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertJsonPath('data.contacts.phone', '+79123456789');
});

it('shows contacts through a shared ministry with members.view_contacts', function () {
    $viewer = Person::factory()->create();
    $person = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => false]);
    $ministryId = (string) Str::ulid();

    app()->instance(SharedMinistryFinder::class, new class($viewer->id, $person->id, $ministryId) implements SharedMinistryFinder
    {
        public function __construct(
            private readonly string $viewerPersonId,
            private readonly string $subjectPersonId,
            private readonly string $ministryId,
        ) {}

        public function sharedMinistryIds(string $viewerPersonId, string $subjectPersonId): array
        {
            return $viewerPersonId === $this->viewerPersonId && $subjectPersonId === $this->subjectPersonId
                ? [$this->ministryId]
                : [];
        }
    });
    app()->instance(MinistryPermissionSource::class, new class($viewer->id, $ministryId) implements MinistryPermissionSource
    {
        public function __construct(
            private readonly string $viewerPersonId,
            private readonly string $ministryId,
        ) {}

        public function forPerson(string $personId): array
        {
            return $personId === $this->viewerPersonId
                ? [$this->ministryId => [Permission::MembersViewContacts->value]]
                : [];
        }
    });
    actingAsUserWith([Permission::PeopleView], $viewer);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonPath('data.contacts.phone', '+79123456789');
});

it('always shows a person their own contacts', function () {
    $person = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => false]);
    actingAsUserWith([], $person);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonPath('data.contacts.phone', '+79123456789');
});

it('denies a disabled account access to its own person card', function () {
    $person = Person::factory()->create(['phone' => '+79123456789']);
    actingAsUserWith([], $person)->update(['disabled_at' => now()]);

    $this->getJson("/api/v1/people/{$person->id}")->assertForbidden();
});

it('reports no contact visibility for a disabled account', function () {
    $person = Person::factory()->create(['contacts_public' => true]);
    $user = User::factory()->for($person)->create(['disabled_at' => now()]);

    expect(app(PersonVisibility::class)->canSeeContacts($user, $person))->toBeFalse();
});

it('hides notes without people.view_notes', function () {
    actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create(['note' => 'Нужна помощь с переездом']);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonMissingPath('data.note');
});

it('hides a person their own note even with people.view_notes', function () {
    $person = Person::factory()->create(['note' => 'Нужна помощь с переездом']);
    actingAsUserWith([Permission::PeopleView, Permission::PeopleViewNotes], $person);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonMissingPath('data.note');
});

it('shows notes about other people with people.view_notes', function () {
    actingAsUserWith([Permission::PeopleView, Permission::PeopleViewNotes]);
    $person = Person::factory()->create(['note' => 'Нужна помощь с переездом']);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertJsonPath('data.note', 'Нужна помощь с переездом');
});
