<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('documents an exact nullable account id and boolean account filter', function () {
    $schema = app(Generator::class)();
    expect($schema['components']['schemas']['PersonResource']['properties']['user_id']['type'])->toEqualCanonicalizing(['string', 'null']);
    $filter = collect($schema['paths']['/people']['get']['parameters'])->firstWhere('name', 'has_account');
    expect($filter['schema']['type'])->toBe('boolean');
});

it('exposes exact nullable account ids without per-person queries', function () {
    actingAsUserWith([Permission::PeopleView, Permission::PeopleViewContacts]);
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $without = Person::factory()->create();
    $this->getJson("/api/v1/people/{$person->id}")->assertOk()->assertJsonPath('data.user_id', $user->id);
    $this->getJson("/api/v1/people/{$without->id}")->assertOk()->assertJsonPath('data.user_id', null);
    DB::enableQueryLog();
    $this->getJson('/api/v1/people')->assertOk();
    $small = count(DB::getQueryLog());
    Person::factory()->count(12)->has(User::factory())->create();
    DB::flushQueryLog();
    $this->getJson('/api/v1/people')->assertOk();
    expect(count(DB::getQueryLog()))->toBe($small);
    DB::disableQueryLog();
});

it('filters account existence before pagination and distinguishes false from absent', function () {
    $viewer = actingAsUserWith([Permission::PeopleView]);
    Person::factory()->count(30)->create(['last_name' => 'Ааа']);
    $enabled = User::factory()->create();
    $disabled = User::factory()->create(['disabled_at' => now()]);
    $response = $this->getJson('/api/v1/people?has_account=1&per_page=100')->assertOk();
    expect($response->json('data.*.user_id'))->toEqualCanonicalizing([$viewer->id, $enabled->id, $disabled->id]);
    $this->getJson('/api/v1/people?has_account=0&per_page=100')->assertOk()->assertJsonCount(30, 'data');
    $this->getJson('/api/v1/people?per_page=100')->assertOk()->assertJsonCount(33, 'data');
    $this->getJson('/api/v1/people?has_account=invalid')->assertUnprocessable()->assertJsonValidationErrors('has_account');
});

it('does not let chat permissions bypass Directory visibility', function () {
    actingAsUserWith([Permission::ChatsDm, Permission::ChatsCreateGroups]);
    $this->getJson('/api/v1/people?has_account=1')->assertForbidden();
});
