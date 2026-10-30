<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Events\PersonArchived;
use App\Modules\Directory\Events\PersonCreated;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

it('denies creating a person without people.manage', function () {
    actingAsUserWith([Permission::PeopleView]);

    $this->postJson('/api/v1/people', [
        'last_name' => 'Иванов',
        'first_name' => 'Иван',
        'status' => 'member',
    ])->assertForbidden();
});

it('creates a person with normalised contacts', function () {
    actingAsUserWith([Permission::PeopleManage]);
    Event::fake([PersonCreated::class]);

    $response = $this->postJson('/api/v1/people', [
        'last_name' => 'Иванов',
        'first_name' => 'Иван',
        'patronymic' => 'Петрович',
        'status' => 'member',
        'phone' => '8 912 345 67 89',
        'email' => 'IVAN@Example.COM',
    ])->assertCreated()
        ->assertJsonPath('data.full_name', 'Иванов Иван Петрович')
        ->assertJsonPath('data.archived', false)
        ->assertJsonPath('data.has_account', false)
        ->assertJsonPath('data.user_id', null)
        ->assertJsonPath('data.has_global_roles', false);

    $person = Person::query()->whereKey($response->json('data.id'))->sole();

    expect($person->phone)->toBe('+79123456789')
        ->and($person->email)->toBe('ivan@example.com');

    Event::assertDispatched(
        PersonCreated::class,
        fn (PersonCreated $event): bool => $event->personId === $person->id,
    );
});

it('warns about a duplicate phone without blocking creation', function () {
    actingAsUserWith([Permission::PeopleManage]);
    Person::factory()->create(['phone' => '+79123456789']);

    $this->postJson('/api/v1/people', [
        'last_name' => 'Иванов',
        'first_name' => 'Иван',
        'status' => 'guest',
        'phone' => '+79123456789',
    ])->assertCreated()
        ->assertJsonPath('warnings.0.code', 'person.duplicate_phone');

    expect(Person::query()->count())->toBe(3);
});

it('warns about a duplicate email without blocking creation', function () {
    actingAsUserWith([Permission::PeopleManage]);
    Person::factory()->create(['email' => 'ivan@example.com']);

    $this->postJson('/api/v1/people', [
        'last_name' => 'Иванов',
        'first_name' => 'Иван',
        'status' => 'guest',
        'email' => 'IVAN@EXAMPLE.COM',
    ])->assertCreated()
        ->assertJsonPath('warnings.0.code', 'person.duplicate_email');

    expect(Person::query()->count())->toBe(3);
});

it('requires a known person status', function () {
    actingAsUserWith([Permission::PeopleManage]);

    $this->postJson('/api/v1/people', [
        'last_name' => 'Иванов',
        'first_name' => 'Иван',
        'status' => 'angel',
    ])->assertUnprocessable()->assertJsonValidationErrors('status');
});

it('denies viewing a person without people.view', function () {
    actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->create();

    $this->getJson("/api/v1/people/{$person->id}")->assertForbidden();
});

it('shows the basic person card with account and role flags', function () {
    actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create([
        'last_name' => 'Иванов',
        'first_name' => 'Иван',
        'patronymic' => null,
        'phone' => '+79123456789',
        'note' => 'Не показывать пока задаче 12.',
    ]);
    User::factory()->for($person)->create();
    $person->globalRoles()->attach(Role::factory()->global()->create());

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonPath('data.full_name', 'Иванов Иван')
        ->assertJsonPath('data.status', 'attendee')
        ->assertJsonPath('data.archived', false)
        ->assertJsonPath('data.has_account', true)
        ->assertJsonPath('data.has_global_roles', true)
        ->assertJsonMissingPath('data.contacts')
        ->assertJsonMissingPath('data.note');
});

it('includes a signed photo url when a photo is attached', function () {
    actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create();
    $media = Media::factory()->create(['variants' => ['thumb' => '2026/09/p_thumb.webp']]);
    $person->forceFill(['photo_media_id' => $media->id])->save();

    $url = $this->getJson("/api/v1/people/{$person->id}")->assertOk()->json('data.photo_url');

    expect($url)->not->toBeNull();
    $this->get($url)->assertOk()->assertHeader('X-Accel-Redirect', '/_protected/2026/09/p_thumb.webp');
});

it('omits the photo url when the person has no photo', function () {
    actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create();

    $this->getJson("/api/v1/people/{$person->id}")->assertOk()->assertJsonPath('data.photo_url', null);
});

it('updates only the submitted person fields', function () {
    actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->create([
        'last_name' => 'Иванов',
        'first_name' => 'Иван',
        'phone' => '+79123456789',
        'email' => 'old@example.com',
    ]);

    $this->patchJson("/api/v1/people/{$person->id}", [
        'first_name' => 'Пётр',
        'email' => 'NEW@EXAMPLE.COM',
    ])->assertOk()->assertJsonPath('data.full_name', 'Иванов Пётр');

    $person->refresh();

    expect($person->last_name)->toBe('Иванов')
        ->and($person->phone)->toBe('+79123456789')
        ->and($person->email)->toBe('new@example.com');
});

it('normalises a submitted phone when updating a person', function () {
    actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->create();

    $this->patchJson("/api/v1/people/{$person->id}", [
        'phone' => '8 912 345 67 89',
    ])->assertOk();

    expect($person->fresh()->phone)->toBe('+79123456789');
});

it('writes person creation to the journal', function () {
    actingAsUserWith([Permission::PeopleManage]);

    $response = $this->postJson('/api/v1/people', [
        'last_name' => 'Иванов',
        'first_name' => 'Иван',
        'status' => 'member',
    ])->assertCreated();

    $entry = AuditEntry::query()->where('action', 'person.created')->sole();

    expect($entry->subject_type)->toBe('person')
        ->and($entry->subject_id)->toBe($response->json('data.id'));
});

it('archives a person and keeps the record available by direct link', function () {
    actingAsUserWith([Permission::PeopleManage, Permission::PeopleView]);
    $person = Person::factory()->create();
    Event::fake([PersonArchived::class]);

    $this->postJson("/api/v1/people/{$person->id}/archive")
        ->assertOk()
        ->assertJsonPath('data.archived', true);

    expect($person->fresh()->archived_at)->not->toBeNull();

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonPath('data.archived', true);

    Event::assertDispatched(
        PersonArchived::class,
        fn (PersonArchived $event): bool => $event->personId === $person->id,
    );
});

it('restores an archived person', function () {
    actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->archived()->create();

    $this->postJson("/api/v1/people/{$person->id}/restore")
        ->assertOk()
        ->assertJsonPath('data.archived', false);

    expect($person->fresh()->archived_at)->toBeNull();
});

it('refuses to edit an archived person', function () {
    actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->archived()->create();

    $this->patchJson("/api/v1/people/{$person->id}", ['first_name' => 'Пётр'])
        ->assertUnprocessable()
        ->assertJsonPath('code', 'person.archived');
});

it('writes archiving and restoration to the journal', function () {
    actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->create();

    $this->postJson("/api/v1/people/{$person->id}/archive")->assertOk();
    $this->postJson("/api/v1/people/{$person->id}/restore")->assertOk();

    $entries = AuditEntry::query()
        ->where('subject_type', 'person')
        ->where('subject_id', $person->id)
        ->pluck('action')
        ->all();

    expect($entries)->toContain('person.archived', 'person.restored');
});
