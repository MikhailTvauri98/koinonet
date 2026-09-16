<?php

declare(strict_types=1);

use App\Modules\Access\Contracts\MinistryPermissionSource;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionCache;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('gives an administrator every global permission', function () {
    $person = Person::factory()->create();
    $person->globalRoles()->attach(Role::factory()->system()->create());
    $user = User::factory()->for($person)->create();

    $resolved = app(PermissionResolver::class)->for($user);

    expect($resolved->administrator)->toBeTrue()
        ->and($resolved->global)->toContain(Permission::SettingsManage->value);
});

it('unions the permissions of all global roles', function () {
    $person = Person::factory()->create();
    $person->globalRoles()->attach([
        Role::factory()->global()->withPermissions([Permission::PeopleView])->create()->id,
        Role::factory()->global()->withPermissions([Permission::AuditView])->create()->id,
    ]);
    $user = User::factory()->for($person)->create();

    expect(app(PermissionResolver::class)->for($user)->global)
        ->toEqualCanonicalizing([Permission::PeopleView->value, Permission::AuditView->value]);
});

it('gives a disabled account no permissions at all', function () {
    $person = Person::factory()->create();
    $person->globalRoles()->attach(Role::factory()->system()->create());
    $user = User::factory()->for($person)->create(['disabled_at' => now()]);

    $resolved = app(PermissionResolver::class)->for($user);

    expect($resolved->administrator)->toBeFalse()->and($resolved->global)->toBeEmpty();
});

it('caches the resolution until the version is bumped', function () {
    $person = Person::factory()->create();
    $role = Role::factory()->global()->withPermissions([Permission::PeopleView])->create();
    $person->globalRoles()->attach($role);
    $user = User::factory()->for($person)->create();

    expect(app(PermissionResolver::class)->can($user, Permission::PeopleView))->toBeTrue();

    $person->globalRoles()->detach($role);
    expect(app(PermissionResolver::class)->can($user, Permission::PeopleView))->toBeTrue();

    app(PermissionCache::class)->bump($user->id);
    expect(app(PermissionResolver::class)->can($user, Permission::PeopleView))->toBeFalse();
});

it('lets ministries.manage_all stand in for any ministry permission', function () {
    $person = Person::factory()->create();
    $person->globalRoles()->attach(
        Role::factory()->global()->withPermissions([Permission::MinistriesManageAll])->create()
    );
    $user = User::factory()->for($person)->create();

    expect(app(PermissionResolver::class)->canInMinistry($user, Permission::MembersManage, (string) Str::ulid()))
        ->toBeTrue();
});

it('uses ministry permissions to authorize members within their ministry', function () {
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $ministryId = (string) Str::ulid();

    app()->instance(MinistryPermissionSource::class, new class($person->id, $ministryId) implements MinistryPermissionSource
    {
        public function __construct(
            private readonly string $personId,
            private readonly string $ministryId,
        ) {}

        public function forPerson(string $personId): array
        {
            return $personId === $this->personId
                ? [$this->ministryId => [Permission::MembersManage->value]]
                : [];
        }
    });

    $resolver = app(PermissionResolver::class);

    expect($resolver->canInMinistry($user, Permission::MembersManage, $ministryId))->toBeTrue()
        ->and($resolver->isMember($user, $ministryId))->toBeTrue()
        ->and($resolver->isMember($user, (string) Str::ulid()))->toBeFalse();
});

it('exposes the resolved permissions through auth me', function () {
    $person = Person::factory()->create();
    $person->globalRoles()->attach(
        Role::factory()->global()->withPermissions([Permission::PeopleView])->create()
    );
    actingAsUser($person);

    $this->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonPath('permissions.administrator', false)
        ->assertJsonPath('permissions.global', [Permission::PeopleView->value]);
});
