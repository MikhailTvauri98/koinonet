<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Ministries\Models\MinistryMember;
use Tests\TestCase;

pest()->extend(TestCase::class)->in('Feature');

/** @param array<string, mixed> $attributes */
function actingAsUser(?Person $person = null, array $attributes = []): User
{
    $user = User::factory()
        ->for($person ?? Person::factory()->create())
        ->create($attributes);

    test()->actingAs($user, 'web');

    return $user;
}

/** @param list<Permission> $permissions */
function actingAsUserWith(array $permissions, ?Person $person = null): User
{
    $person ??= Person::factory()->create();
    $person->globalRoles()->attach(
        Role::factory()->global()->withPermissions($permissions)->create(),
    );

    return actingAsUser($person);
}

function actingAsAdministrator(): User
{
    $person = Person::factory()->create();
    $person->globalRoles()->attach(Role::factory()->system()->create());

    return actingAsUser($person);
}

/**
 * Membership with the roles a member should have; without roles the ministry default is given.
 *
 * @param  list<string>  $roleIds
 */
function memberOf(Ministry $ministry, Person $person, array $roleIds = []): MinistryMember
{
    $member = MinistryMember::query()->create([
        'ministry_id' => $ministry->id,
        'person_id' => $person->id,
        'joined_at' => now(),
    ]);

    $member->roles()->attach(
        $roleIds === [] ? [$ministry->default_role_id] : $roleIds,
        ['ministry_id' => $ministry->id],
    );

    return $member;
}

/** Keeps one session id across every request of a test, the way a browser cookie does. */
function keepSessionCookie(): string
{
    $id = session()->getId();
    test()->withCredentials()->withCookie((string) config('session.cookie'), $id);

    return $id;
}
