<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('denies managing members without members.manage', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => Person::factory()->create()->id])
        ->assertForbidden();
});

it('adds a member with the default role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $person = Person::factory()->create();

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => $person->id])
        ->assertCreated()
        ->assertJsonPath('data.roles.0.name', 'Участник');
});

it('adds a member with extra roles on top of the default one', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();
    $person = Person::factory()->create();

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", [
        'person_id' => $person->id,
        'role_ids' => [$leader->id],
    ])->assertCreated();

    $member = $ministry->members()->where('person_id', $person->id)->sole();
    expect($member->roles->pluck('name')->all())->toEqualCanonicalizing(['Участник', 'Лидер']);
});

it('refuses to add the same person twice', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $person = Person::factory()->create();
    memberOf($ministry, $person);

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => $person->id])
        ->assertStatus(422)->assertJsonPath('code', 'member.already_in_ministry');
});

it('refuses to add an archived person', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", [
        'person_id' => Person::factory()->archived()->create()->id,
    ])->assertStatus(422)->assertJsonPath('code', 'member.person_archived');
});

it('refuses a role from another ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    actingAsUserWith([Permission::MinistriesManageAll]);
    $person = Person::factory()->create();
    $member = memberOf($ministry, $person);

    $this->putJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}/roles", [
        'role_ids' => [$other->default_role_id],
    ])->assertStatus(422)->assertJsonPath('code', 'member.role_from_other_ministry');
});

it('refuses to strip a member of their last role', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $member = memberOf($ministry, Person::factory()->create());

    $this->putJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}/roles", ['role_ids' => []])
        ->assertStatus(422)->assertJsonPath('code', 'member.last_role_cannot_be_removed');
});

it('removes a member', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $member = memberOf($ministry, Person::factory()->create());

    $this->deleteJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}")->assertNoContent();

    expect($ministry->members()->count())->toBe(0);
});

it('filters the directory by ministry', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::PeopleView]);
    $inside = Person::factory()->create();
    $outside = Person::factory()->create();
    memberOf($ministry, $inside);

    $ids = collect($this->getJson("/api/v1/people?ministry={$ministry->id}")->json('data'))->pluck('id');

    expect($ids)->toContain($inside->id)->not->toContain($outside->id);
});

it('writes membership changes to the journal', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => Person::factory()->create()->id]);

    expect(AuditEntry::query()->where('action', 'member.added')->exists())->toBeTrue();
});
