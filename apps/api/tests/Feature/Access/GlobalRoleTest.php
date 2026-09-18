<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

it('denies the role editor without roles.manage_global', function () {
    actingAsUser();

    $this->postJson('/api/v1/roles', ['scope' => 'global', 'name' => 'Пастор', 'permissions' => []])
        ->assertForbidden();
});

it('creates a global role with permissions', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);

    $this->postJson('/api/v1/roles', [
        'scope' => 'global',
        'name' => 'Пастор',
        'permissions' => ['people.view', 'people.view_contacts'],
    ])->assertCreated()->assertJsonPath('data.name', 'Пастор');

    expect(Role::query()->where('name', 'Пастор')->sole()->permissions)->toHaveCount(2);
});

it('creates a role with no permissions at all', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);

    $this->postJson('/api/v1/roles', ['scope' => 'global', 'name' => 'Вокалист', 'permissions' => []])
        ->assertCreated();
});

it('refuses ministry roles through the global role endpoint', function () {
    actingAsAdministrator();

    $this->postJson('/api/v1/roles', [
        'scope' => 'ministry',
        'ministry_id' => (string) Str::ulid(),
        'name' => 'Лидер',
        'permissions' => [],
    ])->assertUnprocessable()->assertJsonValidationErrors(['scope', 'ministry_id']);
});

it('refuses a ministry permission on a global role', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);

    $this->postJson('/api/v1/roles', [
        'scope' => 'global',
        'name' => 'Пастор',
        'permissions' => ['members.manage'],
    ])->assertStatus(422)->assertJsonPath('code', 'role.permission_scope_mismatch');
});

it('refuses a duplicate global name', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    Role::factory()->global()->create(['name' => 'Пастор']);

    $this->postJson('/api/v1/roles', ['scope' => 'global', 'name' => 'Пастор', 'permissions' => []])
        ->assertStatus(422)->assertJsonPath('code', 'role.name_taken');
});

it('refuses to rename or re-permission the system role', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $system = Role::factory()->system()->create();

    $this->patchJson("/api/v1/roles/{$system->id}", ['name' => 'Главный'])
        ->assertStatus(422)->assertJsonPath('code', 'role.system_immutable');
});

it('clears a role description when null is sent explicitly', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $role = Role::factory()->global()->create(['description' => 'Старое описание']);

    $this->patchJson("/api/v1/roles/{$role->id}", ['description' => null])
        ->assertOk()
        ->assertJsonPath('data.description', null);

    expect($role->fresh()->description)->toBeNull();
});

it('refuses to delete the system role', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $system = Role::factory()->system()->create();

    $this->deleteJson("/api/v1/roles/{$system->id}")
        ->assertStatus(422)->assertJsonPath('code', 'role.system_immutable');
});

it('detaches a deleted role from its carriers', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $role = Role::factory()->global()->create();
    $person = Person::factory()->create();
    $person->globalRoles()->attach($role);

    $this->deleteJson("/api/v1/roles/{$role->id}")->assertNoContent();

    expect($person->fresh()->globalRoles)->toBeEmpty()
        ->and(Role::query()->find($role->id))->toBeNull();
});

it('reports how many people carry a role', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $role = Role::factory()->global()->create();
    Person::factory()->count(2)->create()->each(fn ($person) => $person->globalRoles()->attach($role));

    $this->getJson("/api/v1/roles/{$role->id}/usage")
        ->assertOk()
        ->assertJsonPath('data.carriers', 2)
        ->assertJsonPath('data.blockers', []);
});

it('writes role changes to the journal', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);

    $this->postJson('/api/v1/roles', ['scope' => 'global', 'name' => 'Пастор', 'permissions' => []]);

    expect(AuditEntry::query()->where('action', 'role.created')->exists())->toBeTrue();
});
