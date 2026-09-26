<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Ministries\Actions\ArchiveMinistry;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Ministries\Models\MinistryMember;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// Architecture 7.3: an archived ministry is not edited - its membership and
// its roles stay as history. Holders of ministries.manage_all and the
// administrator pass every ministry permission check, so the refusal must
// come from the Actions themselves.

/** @return array{Ministry, MinistryMember, Role} */
function archivedMinistryWithMember(): array
{
    $ministry = ministryWithRoles();
    $member = memberOf($ministry, Person::factory()->create());
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();
    app(ArchiveMinistry::class)->handle($ministry);

    return [$ministry->fresh(), $member, $leader];
}

dataset('ministry-wide actors', [
    'administrator' => fn () => actingAsAdministrator(),
    'ministries.manage_all' => fn () => actingAsUserWith([Permission::MinistriesManageAll]),
]);

it('refuses to add a member to an archived ministry', function (Closure $actAs) {
    [$ministry] = archivedMinistryWithMember();
    $actAs();

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => Person::factory()->create()->id])
        ->assertStatus(422)->assertJsonPath('code', 'ministry.archived');

    expect($ministry->members()->count())->toBe(1);
})->with('ministry-wide actors');

it('refuses to change member roles in an archived ministry', function (Closure $actAs) {
    [$ministry, $member, $leader] = archivedMinistryWithMember();
    $actAs();

    $this->putJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}/roles", ['role_ids' => [$leader->id]])
        ->assertStatus(422)->assertJsonPath('code', 'ministry.archived');

    expect($member->roles()->pluck('roles.id')->all())->toBe([$ministry->default_role_id]);
})->with('ministry-wide actors');

it('refuses to remove a member from an archived ministry', function (Closure $actAs) {
    [$ministry, $member] = archivedMinistryWithMember();
    $actAs();

    $this->deleteJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}")
        ->assertStatus(422)->assertJsonPath('code', 'ministry.archived');

    expect(MinistryMember::query()->find($member->id))->not->toBeNull();
})->with('ministry-wide actors');

it('refuses to create a role in an archived ministry', function (Closure $actAs) {
    [$ministry] = archivedMinistryWithMember();
    $actAs();

    $this->postJson("/api/v1/ministries/{$ministry->id}/roles", ['name' => 'Вокалист', 'permissions' => []])
        ->assertStatus(422)->assertJsonPath('code', 'ministry.archived');

    expect($ministry->roles()->where('name', 'Вокалист')->exists())->toBeFalse();
})->with('ministry-wide actors');

it('refuses to edit a role of an archived ministry', function (Closure $actAs) {
    [, , $leader] = archivedMinistryWithMember();
    $actAs();

    $this->patchJson("/api/v1/roles/{$leader->id}", ['name' => 'Ответственный', 'permissions' => []])
        ->assertStatus(422)->assertJsonPath('code', 'ministry.archived');

    expect($leader->fresh()->name)->toBe('Лидер')
        ->and($leader->fresh()->permissions)->not->toBeEmpty();
})->with('ministry-wide actors');

it('refuses to delete a role of an archived ministry', function (Closure $actAs) {
    [, , $leader] = archivedMinistryWithMember();
    $actAs();

    $this->deleteJson("/api/v1/roles/{$leader->id}")
        ->assertStatus(422)->assertJsonPath('code', 'ministry.archived');

    expect(Role::query()->find($leader->id))->not->toBeNull();
})->with('ministry-wide actors');
