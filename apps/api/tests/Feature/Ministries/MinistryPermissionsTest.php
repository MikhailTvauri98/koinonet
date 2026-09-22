<?php

declare(strict_types=1);

use App\Modules\Access\Actions\SetRolePermissions;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Actions\RemoveMember;
use App\Modules\Ministries\Actions\SetMemberRoles;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('lets a member with members.manage manage their own ministry only', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => Person::factory()->create()->id])
        ->assertCreated();

    $this->postJson("/api/v1/ministries/{$other->id}/members", ['person_id' => Person::factory()->create()->id])
        ->assertForbidden();
});

it('grants a member the permissions of their ministry roles', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    memberOf($ministry, $person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $ministry->id))->toBeTrue();
});

it('does not leak ministry permissions to another ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    memberOf($ministry, $person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $other->id))->toBeFalse();
});

it('treats a member with a permissionless role as a member', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    memberOf($ministry, $person);

    expect(app(PermissionResolver::class)->isMember($user, $ministry->id))->toBeTrue()
        ->and(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $ministry->id))->toBeFalse();
});

it('refreshes permissions when a member is added', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $ministry->id))->toBeFalse();

    memberOf($ministry, $person, [$leader->id]);

    expect(app(PermissionResolver::class)->canInMinistry($user->fresh(), Permission::MembersManage, $ministry->id))
        ->toBeTrue();
});

it('refreshes permissions when a member gains a role', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $member = memberOf($ministry, $person);
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $ministry->id))->toBeFalse();

    app(SetMemberRoles::class)->handle($ministry, $member, [$leader->id]);

    expect(app(PermissionResolver::class)->canInMinistry($user->fresh(), Permission::MembersManage, $ministry->id))
        ->toBeTrue();
});

it('refreshes permissions when a member is removed', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $member = memberOf($ministry, $person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $ministry->id))->toBeTrue();

    app(RemoveMember::class)->handle($ministry, $member);

    expect(app(PermissionResolver::class)->canInMinistry($user->fresh(), Permission::MembersManage, $ministry->id))
        ->toBeFalse();
});

it('refreshes permissions when a role loses a permission', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();
    memberOf($ministry, $person, [$leader->id]);

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, $ministry->id))->toBeTrue();

    app(SetRolePermissions::class)->handle($leader, [Permission::MinistryEdit]);

    expect(app(PermissionResolver::class)->canInMinistry($user->fresh(), Permission::MembersManage, $ministry->id))
        ->toBeFalse();
});

it('shows contacts to a fellow member with members.view_contacts', function () {
    $ministry = ministryWithRoles();
    $viewerPerson = Person::factory()->create();
    $subject = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => false]);
    $role = Role::query()->create([
        'scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Куратор',
    ]);
    $role->permissions()->create(['permission' => Permission::MembersViewContacts->value]);

    memberOf($ministry, $viewerPerson, [$role->id]);
    memberOf($ministry, $subject);

    actingAsUserWith([Permission::PeopleView], $viewerPerson);

    $this->getJson("/api/v1/people/{$subject->id}")->assertJsonPath('data.contacts.phone', '+79123456789');
});

it('hides contacts of a person from another ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $viewerPerson = Person::factory()->create();
    $subject = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => false]);
    $role = Role::query()->create([
        'scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Куратор',
    ]);
    $role->permissions()->create(['permission' => Permission::MembersViewContacts->value]);

    memberOf($ministry, $viewerPerson, [$role->id]);
    memberOf($other, $subject);

    actingAsUserWith([Permission::PeopleView], $viewerPerson);

    $this->getJson("/api/v1/people/{$subject->id}")->assertJsonMissingPath('data.contacts');
});
