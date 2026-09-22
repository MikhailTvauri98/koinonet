<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

it('denies role assignment without roles.manage_global', function () {
    actingAsUser();
    $person = Person::factory()->create();

    $this->putJson("/api/v1/people/{$person->id}/roles", ['role_ids' => []])->assertForbidden();
});

it('replaces the whole set of global roles', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $person = Person::factory()->create();
    $old = Role::factory()->global()->create();
    $new = Role::factory()->global()->create();
    $person->globalRoles()->attach($old);

    $this->putJson("/api/v1/people/{$person->id}/roles", ['role_ids' => [$new->id]])->assertOk();

    expect($person->fresh()->globalRoles->pluck('id')->all())->toBe([$new->id]);
});

it('refuses a ministry role as a global one', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $person = Person::factory()->create();
    $ministryRole = Role::factory()->ministry(Ministry::factory()->create()->id)->create();

    $this->putJson("/api/v1/people/{$person->id}/roles", ['role_ids' => [$ministryRole->id]])
        ->assertStatus(422)
        ->assertJsonPath('code', 'role.scope_not_global');
});

it('refuses an unknown role id', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $person = Person::factory()->create();

    $this->putJson("/api/v1/people/{$person->id}/roles", ['role_ids' => [(string) Str::ulid()]])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['role_ids.0']);
});

it('refuses duplicate role ids', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $person = Person::factory()->create();
    $role = Role::factory()->global()->create();

    $this->putJson("/api/v1/people/{$person->id}/roles", ['role_ids' => [$role->id, $role->id]])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['role_ids.1']);
});

it('refuses to remove the administrator role from the last carrier', function () {
    $admin = actingAsAdministrator();

    $this->putJson("/api/v1/people/{$admin->person_id}/roles", ['role_ids' => []])
        ->assertStatus(422)
        ->assertJsonPath('code', 'role.last_administrator');
});

it('allows removing administrator while another carrier remains', function () {
    $admin = actingAsAdministrator();
    $system = Role::query()->where('is_system', true)->sole();
    $other = Person::factory()->create();
    $other->globalRoles()->attach($system);

    $this->putJson("/api/v1/people/{$admin->person_id}/roles", ['role_ids' => []])->assertOk();
});

it('invalidates the permission cache of the affected account', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $role = Role::factory()->global()->withPermissions([Permission::PeopleView])->create();

    expect(app(PermissionResolver::class)->can($user, Permission::PeopleView))->toBeFalse();

    $this->putJson("/api/v1/people/{$person->id}/roles", ['role_ids' => [$role->id]])->assertOk();

    expect(app(PermissionResolver::class)->can($user->fresh(), Permission::PeopleView))->toBeTrue();
});

it('writes the previous and new roles to the journal', function () {
    actingAsUserWith([Permission::RolesManageGlobal]);
    $person = Person::factory()->create();
    $old = Role::factory()->global()->create();
    $new = Role::factory()->global()->create();
    $person->globalRoles()->attach($old);

    $this->putJson("/api/v1/people/{$person->id}/roles", ['role_ids' => [$new->id]])->assertOk();

    $entry = AuditEntry::query()->where('action', 'person.roles_changed')->sole();

    expect($entry->subject_type)->toBe('person')
        ->and($entry->subject_id)->toBe($person->id)
        ->and($entry->payload['before'])->toBe([$old->id])
        ->and($entry->payload['after'])->toBe([$new->id]);
});
