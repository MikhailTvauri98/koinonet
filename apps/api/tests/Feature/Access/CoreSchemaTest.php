<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\RoleScope;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

it('requires a user to have a phone or an email', function () {
    $person = Person::factory()->create();

    expect(fn () => User::factory()->for($person)->create(['phone' => null, 'email' => null]))
        ->toThrow(QueryException::class);
});

it('allows only one user per person', function () {
    $person = Person::factory()->create();
    User::factory()->for($person)->create();

    expect(fn () => User::factory()->for($person)->create())->toThrow(QueryException::class);
});

it('forbids a ministry id on a global role', function () {
    expect(fn () => Role::factory()->create([
        'scope' => RoleScope::Global,
        'ministry_id' => (string) Str::ulid(),
    ]))->toThrow(QueryException::class);
});

it('requires a ministry id on a ministry role', function () {
    expect(fn () => Role::factory()->create([
        'scope' => RoleScope::Ministry,
        'ministry_id' => null,
    ]))->toThrow(QueryException::class);
});

it('keeps global role names unique', function () {
    Role::factory()->global()->create(['name' => 'Пастор']);

    expect(fn () => Role::factory()->global()->create(['name' => 'Пастор']))
        ->toThrow(QueryException::class);
});

it('allows only one system role', function () {
    Role::factory()->system()->create();

    expect(fn () => Role::factory()->system()->create())->toThrow(QueryException::class);
});

it('uses 26-character ulids as primary keys', function () {
    expect(strlen(Person::factory()->create()->id))->toBe(26);
});
