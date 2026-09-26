<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Media\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('denies managing members without members.manage', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => Person::factory()->create()->id])
        ->assertForbidden();
});

it('denies the roster to a non-member without ministries.view_all', function () {
    $ministry = ministryWithRoles();
    memberOf($ministry, Person::factory()->create());
    actingAsUserWith([Permission::PeopleView]);

    $this->getJson("/api/v1/ministries/{$ministry->id}/members")->assertForbidden();
});

it('shows the roster to a non-member with ministries.view_all', function () {
    $ministry = ministryWithRoles();
    memberOf($ministry, Person::factory()->create());
    actingAsUserWith([Permission::MinistriesViewAll]);

    $this->getJson("/api/v1/ministries/{$ministry->id}/members")->assertOk()->assertJsonCount(1, 'data');
});

it('denies changing member roles without members.manage', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);
    $member = memberOf($ministry, Person::factory()->create());
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();

    $this->putJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}/roles", ['role_ids' => [$leader->id]])
        ->assertForbidden();

    expect($member->roles()->pluck('roles.id')->all())->toBe([$ministry->default_role_id]);
});

it('changes member roles with members.manage in that ministry', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    $manager = Role::factory()->ministry($ministry->id)->withPermissions([Permission::MembersManage])->create();
    memberOf($ministry, $user->person, [$manager->id]);
    $member = memberOf($ministry, Person::factory()->create());
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();

    $this->putJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}/roles", ['role_ids' => [$leader->id]])
        ->assertOk();

    expect($member->roles()->pluck('roles.id')->all())->toBe([$leader->id]);
});

it('denies removing a member without members.manage', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);
    $member = memberOf($ministry, Person::factory()->create());

    $this->deleteJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}")->assertForbidden();

    expect($ministry->members()->whereKey($member->id)->exists())->toBeTrue();
});

it('removes a member with members.manage in that ministry', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    $manager = Role::factory()->ministry($ministry->id)->withPermissions([Permission::MembersManage])->create();
    memberOf($ministry, $user->person, [$manager->id]);
    $member = memberOf($ministry, Person::factory()->create());

    $this->deleteJson("/api/v1/ministries/{$ministry->id}/members/{$member->id}")->assertNoContent();

    expect($ministry->members()->whereKey($member->id)->exists())->toBeFalse();
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

// Review round 2 (task 28): `full_name` follows the same gate as `photo_url`
// right below it (architecture 6.4: "список и базовая карточка: people.view",
// own exempted) - a fellow member without `people.view` sees the roster row
// but not the name or photo behind it.
it('includes a members full name in the roster for a viewer who can see that person', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesViewAll, Permission::PeopleView]);
    $person = Person::factory()->create(['last_name' => 'Прокопенко', 'first_name' => 'Мария', 'patronymic' => null]);
    memberOf($ministry, $person);

    $row = collect($this->getJson("/api/v1/ministries/{$ministry->id}/members")->assertOk()->json('data'))
        ->firstWhere('person_id', $person->id);

    expect($row['full_name'])->toBe('Прокопенко Мария');
});

it('hides a members full name from a fellow member without people.view', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);
    $person = Person::factory()->create(['last_name' => 'Прокопенко', 'first_name' => 'Мария', 'patronymic' => null]);
    memberOf($ministry, $person);

    $row = collect($this->getJson("/api/v1/ministries/{$ministry->id}/members")->assertOk()->json('data'))
        ->firstWhere('person_id', $person->id);

    expect($row['full_name'])->toBeNull();
});

it('shows a member their own full name without people.view', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    $member = memberOf($ministry, $user->person);

    $row = collect($this->getJson("/api/v1/ministries/{$ministry->id}/members")->assertOk()->json('data'))
        ->firstWhere('id', $member->id);

    expect($row['full_name'])->not->toBeNull();
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

it('shows a members photo url to a viewer who can see that person', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesViewAll, Permission::PeopleView]);
    $person = Person::factory()->create();
    memberOf($ministry, $person);
    $media = Media::factory()->create(['variants' => ['thumb' => '2026/09/m_thumb.webp']]);
    $person->forceFill(['photo_media_id' => $media->id])->save();

    $row = collect($this->getJson("/api/v1/ministries/{$ministry->id}/members")->assertOk()->json('data'))
        ->firstWhere('person_id', $person->id);

    expect($row['photo_url'])->not->toBeNull();
});

it('hides a members photo url from a fellow member without people.view', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);
    $person = Person::factory()->create();
    memberOf($ministry, $person);
    $media = Media::factory()->create(['variants' => ['thumb' => '2026/09/m_thumb.webp']]);
    $person->forceFill(['photo_media_id' => $media->id])->save();

    $row = collect($this->getJson("/api/v1/ministries/{$ministry->id}/members")->assertOk()->json('data'))
        ->firstWhere('person_id', $person->id);

    expect($row['photo_url'])->toBeNull();
});

it('shows a member their own photo url without people.view', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    $member = memberOf($ministry, $user->person);
    $media = Media::factory()->create(['variants' => ['thumb' => '2026/09/m_thumb.webp']]);
    $user->person->forceFill(['photo_media_id' => $media->id])->save();

    $row = collect($this->getJson("/api/v1/ministries/{$ministry->id}/members")->assertOk()->json('data'))
        ->firstWhere('id', $member->id);

    expect($row['photo_url'])->not->toBeNull();
});

it('omits the photo url when a member has no photo', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesViewAll, Permission::PeopleView]);
    $person = Person::factory()->create();
    memberOf($ministry, $person);

    $row = collect($this->getJson("/api/v1/ministries/{$ministry->id}/members")->assertOk()->json('data'))
        ->firstWhere('person_id', $person->id);

    expect($row['photo_url'])->toBeNull();
});

it('writes membership changes to the journal', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();
    $person = Person::factory()->create();

    $memberId = $this->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => $person->id])
        ->json('data.id');

    $this->putJson("/api/v1/ministries/{$ministry->id}/members/{$memberId}/roles", ['role_ids' => [$leader->id]]);
    $this->deleteJson("/api/v1/ministries/{$ministry->id}/members/{$memberId}");

    expect(AuditEntry::query()->where('action', 'member.added')->exists())->toBeTrue()
        ->and(AuditEntry::query()->where('action', 'member.roles_changed')->exists())->toBeTrue()
        ->and(AuditEntry::query()->where('action', 'member.removed')->exists())->toBeTrue();
});
