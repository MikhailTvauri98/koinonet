<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('denies the directory without people.view', function () {
    actingAsUser();

    $this->getJson('/api/v1/people')->assertForbidden();
});

it('hides archived people by default', function () {
    actingAsUserWith([Permission::PeopleView]);
    $active = Person::factory()->create();
    $archived = Person::factory()->archived()->create();

    $ids = collect($this->getJson('/api/v1/people')->assertOk()->json('data'))->pluck('id');

    expect($ids)->toContain($active->id)->not->toContain($archived->id);
});

it('finds a person by a misspelled surname', function () {
    actingAsUserWith([Permission::PeopleView]);
    Person::factory()->create(['last_name' => 'Прокопенко', 'first_name' => 'Мария']);

    $this->getJson('/api/v1/people?search=прокопенк')
        ->assertOk()
        ->assertJsonPath('data.0.last_name', 'Прокопенко');
});

it('filters by status', function () {
    actingAsUserWith([Permission::PeopleView]);
    Person::factory()->create(['status' => 'guest']);

    $this->getJson('/api/v1/people?status=guest')->assertOk()->assertJsonCount(1, 'data');
});

it('shows archived people on demand', function () {
    actingAsUserWith([Permission::PeopleView]);
    $archived = Person::factory()->archived()->create();

    $response = $this->getJson('/api/v1/people?archived=1')
        ->assertOk()
        ->assertJsonCount(1, 'data');

    expect(collect($response->json('data'))->pluck('id'))->toContain($archived->id);
});

it('filters people without global roles', function () {
    actingAsUserWith([Permission::PeopleView]);
    $withRole = Person::factory()->create();
    $withRole->globalRoles()->attach(Role::factory()->global()->create());
    $withoutRole = Person::factory()->create();

    $response = $this->getJson('/api/v1/people?without_roles=1')->assertOk();
    $ids = collect($response->json('data'))->pluck('id');

    expect($ids)->toContain($withoutRole->id)->not->toContain($withRole->id);
});

it('paginates', function () {
    actingAsUserWith([Permission::PeopleView]);
    Person::factory()->count(30)->create();

    $this->getJson('/api/v1/people?per_page=10')
        ->assertOk()
        ->assertJsonCount(10, 'data')
        ->assertJsonStructure(['meta' => ['current_page', 'last_page', 'total']]);
});
