<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionScope;
use App\Modules\Access\RoleScope;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('denies creating a ministry without ministries.create', function () {
    actingAsUser();

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление'])->assertForbidden();
});

it('creates a ministry with a leader role and a default member role', function () {
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление'])
        ->assertCreated()
        ->assertJsonPath('data.name', 'Прославление');

    $ministry = Ministry::query()->sole();
    $roles = Role::query()->where('ministry_id', $ministry->id)->with('permissions')->get();

    expect($roles->pluck('name')->all())->toEqualCanonicalizing(['Лидер', 'Участник'])
        ->and($ministry->defaultRole->name)->toBe('Участник')
        ->and($roles->firstWhere('name', 'Лидер')->permissions)
        ->toHaveCount(count(Permission::ofScope(PermissionScope::Ministry)))
        ->and($roles->firstWhere('name', 'Участник')->permissions)->toHaveCount(0);
});

it('does not make the creator a member', function () {
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление']);

    expect(Ministry::query()->sole()->members)->toBeEmpty();
});

it('creates ministry-scoped roles, not global ones', function () {
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление']);

    expect(Role::query()->where('scope', RoleScope::Ministry)->count())->toBe(2)
        ->and(Role::query()->where('scope', RoleScope::Global)->where('name', 'Лидер')->exists())->toBeFalse();
});

it('refuses a duplicate name among active ministries', function () {
    actingAsUserWith([Permission::MinistriesCreate]);
    Ministry::factory()->create(['name' => 'Прославление']);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление'])
        ->assertStatus(422)->assertJsonPath('code', 'ministry.name_taken');
});

it('allows reusing the name of an archived ministry', function () {
    actingAsUserWith([Permission::MinistriesCreate]);
    Ministry::factory()->archived()->create(['name' => 'Прославление']);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление'])->assertCreated();
});

it('denies editing a ministry without ministry.edit in it', function () {
    actingAsUser();
    $ministry = Ministry::factory()->create();

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['name' => 'Другое'])->assertForbidden();
});

it('lets ministries.manage_all edit any ministry', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $ministry = Ministry::factory()->create();

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['description' => 'Служение прославления'])
        ->assertOk();
});

it('archives a ministry and hides it from the list', function () {
    actingAsUserWith([Permission::MinistriesCreate, Permission::MinistriesViewAll]);
    $ministry = Ministry::factory()->create();

    $this->postJson("/api/v1/ministries/{$ministry->id}/archive")->assertOk();

    $ids = collect($this->getJson('/api/v1/ministries')->json('data'))->pluck('id');
    expect($ids)->not->toContain($ministry->id)
        ->and($ministry->fresh()->archived_at)->not->toBeNull();
});

it('shows a member only their own ministries in the list', function () {
    $ministry = Ministry::factory()->create();
    Ministry::factory()->create();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $ids = collect($this->getJson('/api/v1/ministries')->json('data'))->pluck('id');
    expect($ids->all())->toEqual([$ministry->id]);
});

it('shows every ministry to ministries.view_all', function () {
    actingAsUserWith([Permission::MinistriesViewAll]);
    Ministry::factory()->count(2)->create();

    expect($this->getJson('/api/v1/ministries')->json('data'))->toHaveCount(2);
});

it('refuses to edit an archived ministry', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $ministry = Ministry::factory()->archived()->create();

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['name' => 'Другое'])
        ->assertStatus(422)
        ->assertJsonPath('code', 'ministry.archived');
});

it('refuses a rename onto the name of another active ministry', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    Ministry::factory()->create(['name' => 'Прославление']);
    $ministry = Ministry::factory()->create(['name' => 'Дети']);

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['name' => 'Прославление'])
        ->assertStatus(422)
        ->assertJsonPath('code', 'ministry.name_taken');
});

it('keeps the first archival time when archived twice', function () {
    actingAsUserWith([Permission::MinistriesCreate]);
    $ministry = Ministry::factory()->create();

    $this->postJson("/api/v1/ministries/{$ministry->id}/archive")->assertOk();
    $archivedAt = $ministry->fresh()->archived_at;

    $this->postJson("/api/v1/ministries/{$ministry->id}/archive")->assertOk();

    expect($ministry->fresh()->archived_at->equalTo($archivedAt))->toBeTrue()
        ->and(AuditEntry::query()->where('action', 'ministry.archived')->count())->toBe(1);
});

it('hides the ministry card from a stranger', function () {
    actingAsUser();
    $ministry = Ministry::factory()->create();

    $this->getJson("/api/v1/ministries/{$ministry->id}")->assertForbidden();
});

it('shows the ministry card to its member', function () {
    $ministry = Ministry::factory()->create();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $this->getJson("/api/v1/ministries/{$ministry->id}")
        ->assertOk()
        ->assertJsonPath('data.id', $ministry->id);
});

it('shows any ministry card to ministries.view_all', function () {
    actingAsUserWith([Permission::MinistriesViewAll]);
    $ministry = Ministry::factory()->create();

    $this->getJson("/api/v1/ministries/{$ministry->id}")->assertOk();
});
