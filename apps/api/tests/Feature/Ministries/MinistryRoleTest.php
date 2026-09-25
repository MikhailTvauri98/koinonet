<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('denies the ministry role editor without roles.manage in that ministry', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $this->postJson("/api/v1/ministries/{$ministry->id}/roles", ['name' => 'Вокалист', 'permissions' => []])
        ->assertForbidden();
});

it('creates a ministry role without permissions', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/roles", ['name' => 'Вокалист', 'permissions' => []])
        ->assertCreated()->assertJsonPath('data.name', 'Вокалист');
});

it('refuses a global permission on a ministry role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/roles", [
        'name' => 'Вокалист', 'permissions' => ['people.manage'],
    ])->assertStatus(422)->assertJsonPath('code', 'role.permission_scope_mismatch');
});

it('allows renaming and re-permissioning the leader role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();

    $this->patchJson("/api/v1/roles/{$leader->id}", ['name' => 'Ответственный', 'permissions' => ['members.manage']])
        ->assertOk();

    expect($leader->fresh()->name)->toBe('Ответственный')
        ->and($leader->fresh()->permissions)->toHaveCount(1);
});

it('refuses to delete the default role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->deleteJson("/api/v1/roles/{$ministry->default_role_id}")
        ->assertStatus(422)->assertJsonPath('code', 'role.is_default');
});

it('allows deleting the former default role after another is chosen', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $old = $ministry->default_role_id;
    $new = $this->postJson("/api/v1/ministries/{$ministry->id}/roles", ['name' => 'Новичок', 'permissions' => []])
        ->json('data.id');

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['default_role_id' => $new])->assertOk();
    $this->deleteJson("/api/v1/roles/{$old}")->assertNoContent();
});

it('refuses a default role from another ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['default_role_id' => $other->default_role_id])
        ->assertStatus(422)->assertJsonPath('code', 'role.default_from_other_ministry');
});

// Задача 29 (доделка, дефект задачи 18): docs/architecture.md 6.1 закрепляет
// выбор роли по умолчанию за roles.manage, но PATCH /ministries/{id}
// проверял ministry.edit для всех своих полей без разбора. MinistryPolicy::
// changeDefaultRole и разбор полей в MinistryController::update теперь
// требуют право по каждому полю отдельно.
it('changes the default role with roles.manage but without ministry.edit', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    $manager = Role::factory()->ministry($ministry->id)->withPermissions([Permission::RolesManage])->create();
    memberOf($ministry, $user->person, [$manager->id]);
    $newDefault = $ministry->roles()->where('name', 'Лидер')->sole();

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['default_role_id' => $newDefault->id])
        ->assertOk();

    expect($ministry->fresh()->default_role_id)->toBe($newDefault->id);
});

it('refuses to change the default role with only ministry.edit, but still allows renaming', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    $editor = Role::factory()->ministry($ministry->id)->withPermissions([Permission::MinistryEdit])->create();
    memberOf($ministry, $user->person, [$editor->id]);
    $newDefault = $ministry->roles()->where('name', 'Лидер')->sole();

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['default_role_id' => $newDefault->id])
        ->assertForbidden();

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['name' => 'Прославление и музыка'])
        ->assertOk();

    expect($ministry->fresh()->default_role_id)->not->toBe($newDefault->id)
        ->and($ministry->fresh()->name)->toBe('Прославление и музыка');
});

it('refuses a combined change of name and default role to a holder of only one of the two rights', function () {
    $ministry = ministryWithRoles();
    $newDefault = $ministry->roles()->where('name', 'Лидер')->sole();
    $payload = ['name' => 'Прославление и музыка', 'default_role_id' => $newDefault->id];

    $rolesManageOnly = actingAsUser();
    $manager = Role::factory()->ministry($ministry->id)->withPermissions([Permission::RolesManage])->create();
    memberOf($ministry, $rolesManageOnly->person, [$manager->id]);
    $this->patchJson("/api/v1/ministries/{$ministry->id}", $payload)->assertForbidden();

    $ministryEditOnly = actingAsUser();
    $editor = Role::factory()->ministry($ministry->id)->withPermissions([Permission::MinistryEdit])->create();
    memberOf($ministry, $ministryEditOnly->person, [$editor->id]);
    $this->patchJson("/api/v1/ministries/{$ministry->id}", $payload)->assertForbidden();

    expect($ministry->fresh()->name)->toBe('Прославление')
        ->and($ministry->fresh()->default_role_id)->not->toBe($newDefault->id);
});

it('refuses to delete a role that is someones only role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $solo = Role::query()->create([
        'scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Звукорежиссёр',
    ]);
    $member = memberOf($ministry, Person::factory()->create(), [$solo->id]);
    $member->roles()->detach($ministry->default_role_id);

    $this->deleteJson("/api/v1/roles/{$solo->id}")
        ->assertStatus(422)->assertJsonPath('code', 'role.last_role_of_member');
});

it('reports carriers of a ministry role in usage', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    memberOf($ministry, Person::factory()->create());

    $this->getJson("/api/v1/roles/{$ministry->default_role_id}/usage")
        ->assertOk()->assertJsonPath('data.carriers', 1);
});

it('keeps ministry role names unique inside the ministry only', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson("/api/v1/ministries/{$other->id}/roles", ['name' => 'Лидер', 'permissions' => []])
        ->assertStatus(422)->assertJsonPath('code', 'role.name_taken');

    $this->postJson("/api/v1/ministries/{$ministry->id}/roles", ['name' => 'Вокалист', 'permissions' => []])
        ->assertCreated();
});

it('lists the roles of a ministry for someone who can manage them', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->getJson("/api/v1/ministries/{$ministry->id}/roles")
        ->assertOk()
        ->assertJsonCount(2, 'data');
});

it('denies listing ministry roles without roles.manage in that ministry', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $this->getJson("/api/v1/ministries/{$ministry->id}/roles")->assertForbidden();
});

// Task 28 follow-up: granting a ministry role is `members.manage` territory
// (architecture 6.1), so seeing the catalogue to grant from is too -
// `roles.manage` (create/edit/delete the roles themselves) stays a stronger,
// separate permission (see RolePolicy::viewAny).
it('lists ministry roles for a members.manage holder without roles.manage', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    $leaderless = Role::factory()->ministry($ministry->id)->withPermissions([Permission::MembersManage])->create();
    memberOf($ministry, $user->person, [$leaderless->id]);

    $this->getJson("/api/v1/ministries/{$ministry->id}/roles")
        ->assertOk()
        ->assertJsonCount(3, 'data');
});

it('denies listing ministry roles to a members.manage holder of another ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    $role = Role::factory()->ministry($other->id)->withPermissions([Permission::MembersManage])->create();
    memberOf($other, $user->person, [$role->id]);

    $this->getJson("/api/v1/ministries/{$ministry->id}/roles")->assertForbidden();
});

it('deletes a role that a member still holds alongside another role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();
    memberOf($ministry, Person::factory()->create(), [$leader->id]);

    $this->deleteJson("/api/v1/roles/{$leader->id}")->assertNoContent();

    expect($ministry->fresh()->roles()->where('name', 'Лидер')->exists())->toBeFalse();
});
