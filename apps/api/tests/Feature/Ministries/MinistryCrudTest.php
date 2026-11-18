<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionScope;
use App\Modules\Access\RoleScope;
use App\Modules\Directory\Models\Person;
use App\Modules\Media\Models\Media;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('denies creating a ministry without ministries.create', function () {
    actingAsUser();

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление', 'color' => 'teal'])->assertForbidden();
});

it('creates a ministry with a leader role and a default member role', function () {
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление', 'color' => 'teal'])
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

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление', 'color' => 'teal']);

    expect(Ministry::query()->sole()->members)->toBeEmpty();
});

it('creates ministry-scoped roles, not global ones', function () {
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление', 'color' => 'teal']);

    expect(Role::query()->where('scope', RoleScope::Ministry)->count())->toBe(2)
        ->and(Role::query()->where('scope', RoleScope::Global)->where('name', 'Лидер')->exists())->toBeFalse();
});

it('refuses a duplicate name among active ministries', function () {
    actingAsUserWith([Permission::MinistriesCreate]);
    Ministry::factory()->create(['name' => 'Прославление', 'color' => 'teal']);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление', 'color' => 'teal'])
        ->assertStatus(422)->assertJsonPath('code', 'ministry.name_taken');
});

it('allows reusing the name of an archived ministry', function () {
    actingAsUserWith([Permission::MinistriesCreate]);
    Ministry::factory()->archived()->create(['name' => 'Прославление', 'color' => 'teal']);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление', 'color' => 'teal'])->assertCreated();
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
    Ministry::factory()->create(['name' => 'Прославление', 'color' => 'teal']);
    $ministry = Ministry::factory()->create(['name' => 'Дети']);

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['name' => 'Прославление', 'color' => 'teal'])
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

it('includes a signed cover url when a cover is attached', function () {
    actingAsUserWith([Permission::MinistriesViewAll]);
    $ministry = Ministry::factory()->create();
    $media = Media::factory()->create(['variants' => ['thumb' => '2026/09/c_thumb.webp', 'large' => '2026/09/c_large.webp']]);
    $ministry->forceFill(['cover_media_id' => $media->id])->save();

    $url = $this->getJson("/api/v1/ministries/{$ministry->id}")->assertOk()->json('data.cover_url');

    expect($url)->not->toBeNull();
    $this->get($url)->assertOk()->assertHeader('X-Accel-Redirect', '/_protected/2026/09/c_large.webp');
});

it('omits the cover url when the ministry has no cover', function () {
    actingAsUserWith([Permission::MinistriesViewAll]);
    $ministry = Ministry::factory()->create();

    $this->getJson("/api/v1/ministries/{$ministry->id}")->assertOk()->assertJsonPath('data.cover_url', null);
});

it('requires a color when creating a ministry', function () {
    actingAsUserWith([Permission::MinistriesCreate]);

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление'])
        ->assertStatus(422)->assertJsonValidationErrors('color');

    $this->postJson('/api/v1/ministries', ['name' => 'Прославление', 'color' => 'teal'])
        ->assertCreated()->assertJsonPath('data.color', 'teal');
});

it('changes the color with ministry.edit and refuses to clear it', function () {
    $ministry = ministryWithRoles();
    actingAsUser();
    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['color' => 'rose'])->assertForbidden();

    app('auth')->forgetGuards();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['color' => 'rose'])
        ->assertOk()->assertJsonPath('data.color', 'rose');
    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['color' => null])
        ->assertStatus(422)->assertJsonValidationErrors('color');
    $this->patchJson("/api/v1/ministries/{$ministry->id}", ['color' => 'magenta'])
        ->assertStatus(422)->assertJsonValidationErrors('color');
    expect($ministry->fresh()->color->value)->toBe('rose')
        ->and(AuditEntry::query()->where('action', 'like', 'ministry.%')->where('action', '!=', 'ministry.created')->count())->toBe(0);
});

it('returns null color for ministries created before the column', function () {
    actingAsUserWith([Permission::MinistriesViewAll]);
    $ministry = Ministry::factory()->create(['color' => null]);

    $this->getJson("/api/v1/ministries/{$ministry->id}")->assertOk()->assertJsonPath('data.color', null);
});

it('counts members', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    foreach (range(1, 3) as $i) {
        memberOf($ministry, Person::factory()->create());
    }
    memberOf($other, Person::factory()->create());
    actingAsUserWith([Permission::MinistriesViewAll, Permission::MinistriesManageAll]);

    $members = $this->getJson("/api/v1/ministries/{$ministry->id}/members")->assertOk()->json('data');
    $list = collect($this->getJson('/api/v1/ministries')->json('data'))->pluck('members_count', 'id');

    expect($members)->toHaveCount(3)
        ->and($list[$ministry->id])->toBe(3)
        ->and($list[$other->id])->toBe(1);
    $this->getJson("/api/v1/ministries/{$ministry->id}")->assertJsonPath('data.members_count', 3);
});

it('does not query members once per ministry in the list', function () {
    foreach (range(1, 4) as $i) {
        memberOf(ministryWithRoles("Служение {$i}"), Person::factory()->create());
    }
    actingAsUserWith([Permission::MinistriesViewAll]);

    DB::enableQueryLog();
    $this->getJson('/api/v1/ministries')->assertOk();
    $counts = collect(DB::getQueryLog())->filter(fn ($q) => str_contains($q['query'], 'count(*) from "ministry_members"'));
    DB::disableQueryLog();

    expect($counts)->toHaveCount(1);
});
