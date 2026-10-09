<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;

uses(RefreshDatabase::class);

/*
 * The test CLAUDE.md asks of every key in the catalogue: one request, refused
 * without the key and allowed with it, everything else equal. The dataset is the
 * catalogue itself, so a key added without a case below fails the suite.
 */

/** @param list<Permission> $baseline what the actor holds either way */
function actingWithGlobalKey(Permission $key, bool $granted, array $baseline = []): void
{
    actingAsUserWith($granted ? [...$baseline, $key] : $baseline);
}

/**
 * The actor joins a new ministry through a role that holds the key or nothing.
 *
 * @param  list<Permission>  $globalBaseline  global keys the actor holds either way
 */
function actingAsMemberWithKey(Permission $key, bool $granted, array $globalBaseline = []): Ministry
{
    $ministry = ministryWithRoles('Служение проверки прав');
    $role = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Проверяемая']);

    if ($granted) {
        $role->permissions()->create(['permission' => $key->value]);
    }

    $person = Person::factory()->create();
    memberOf($ministry, $person, [$role->id]);
    actingAsUserWith($globalBaseline, $person);

    return $ministry;
}

/** @return array<string, Closure(bool): void> */
function permissionCases(): array
{
    return [
        Permission::PeopleView->value => function (bool $granted): void {
            actingWithGlobalKey(Permission::PeopleView, $granted);

            test()->getJson('/api/v1/people')->assertStatus($granted ? 200 : 403);
        },

        Permission::PeopleViewContacts->value => function (bool $granted): void {
            actingWithGlobalKey(Permission::PeopleViewContacts, $granted, [Permission::PeopleView]);
            $person = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => false]);

            $card = test()->getJson("/api/v1/people/{$person->id}")->assertOk();

            $granted
                ? $card->assertJsonPath('data.contacts.phone', '+79123456789')
                : $card->assertJsonMissingPath('data.contacts');
        },

        Permission::PeopleViewNotes->value => function (bool $granted): void {
            actingWithGlobalKey(Permission::PeopleViewNotes, $granted, [Permission::PeopleView]);
            $person = Person::factory()->create(['note' => 'Нужна помощь с переездом']);

            $card = test()->getJson("/api/v1/people/{$person->id}")->assertOk();

            $granted
                ? $card->assertJsonPath('data.note', 'Нужна помощь с переездом')
                : $card->assertJsonMissingPath('data.note');
        },

        Permission::PeopleManage->value => function (bool $granted): void {
            actingWithGlobalKey(Permission::PeopleManage, $granted);

            test()->postJson('/api/v1/people', ['last_name' => 'Петрова', 'first_name' => 'Анна', 'status' => 'member'])
                ->assertStatus($granted ? 201 : 403);
        },

        Permission::PeopleInvite->value => function (bool $granted): void {
            actingWithGlobalKey(Permission::PeopleInvite, $granted);
            $person = Person::factory()->create();
            $person->globalRoles()->attach(Role::factory()->global()->create());

            test()->postJson("/api/v1/people/{$person->id}/invite")->assertStatus($granted ? 201 : 403);
        },

        Permission::MinistriesCreate->value => function (bool $granted): void {
            actingWithGlobalKey(Permission::MinistriesCreate, $granted);

            test()->postJson('/api/v1/ministries', ['name' => 'Прославление'])->assertStatus($granted ? 201 : 403);
        },

        Permission::MinistriesViewAll->value => function (bool $granted): void {
            actingWithGlobalKey(Permission::MinistriesViewAll, $granted);
            $ministry = ministryWithRoles();

            test()->getJson("/api/v1/ministries/{$ministry->id}")->assertStatus($granted ? 200 : 403);
        },

        Permission::MinistriesManageAll->value => function (bool $granted): void {
            actingWithGlobalKey(Permission::MinistriesManageAll, $granted);
            $ministry = ministryWithRoles();

            test()->patchJson("/api/v1/ministries/{$ministry->id}", ['description' => 'Новое описание'])
                ->assertStatus($granted ? 200 : 403);
        },

        Permission::RolesManageGlobal->value => function (bool $granted): void {
            actingWithGlobalKey(Permission::RolesManageGlobal, $granted);

            test()->postJson('/api/v1/roles', ['scope' => 'global', 'name' => 'Пастор', 'permissions' => []])
                ->assertStatus($granted ? 201 : 403);
        },

        Permission::SettingsManage->value => function (bool $granted): void {
            actingWithGlobalKey(Permission::SettingsManage, $granted);

            test()->putJson('/api/v1/settings', ['church_name' => 'Дом хлеба', 'timezone' => 'Europe/Moscow', 'phone_region' => 'RU'])
                ->assertStatus($granted ? 200 : 403);

            // The settings cache outlives the rolled-back transaction; other tests must not read this write.
            Cache::forget('settings');
        },

        Permission::AuditView->value => function (bool $granted): void {
            actingWithGlobalKey(Permission::AuditView, $granted);

            test()->getJson('/api/v1/audit')->assertStatus($granted ? 200 : 403);
        },

        Permission::MembersManage->value => function (bool $granted): void {
            $ministry = actingAsMemberWithKey(Permission::MembersManage, $granted);

            test()->postJson("/api/v1/ministries/{$ministry->id}/members", ['person_id' => Person::factory()->create()->id])
                ->assertStatus($granted ? 201 : 403);
        },

        Permission::MembersViewContacts->value => function (bool $granted): void {
            $ministry = actingAsMemberWithKey(Permission::MembersViewContacts, $granted, [Permission::PeopleView]);
            $colleague = Person::factory()->create(['phone' => '+79123456789', 'contacts_public' => false]);
            memberOf($ministry, $colleague);

            $card = test()->getJson("/api/v1/people/{$colleague->id}")->assertOk();

            $granted
                ? $card->assertJsonPath('data.contacts.phone', '+79123456789')
                : $card->assertJsonMissingPath('data.contacts');
        },

        Permission::RolesManage->value => function (bool $granted): void {
            $ministry = actingAsMemberWithKey(Permission::RolesManage, $granted);

            test()->postJson("/api/v1/ministries/{$ministry->id}/roles", ['name' => 'Вокалист', 'permissions' => []])
                ->assertStatus($granted ? 201 : 403);
        },

        Permission::MinistryEdit->value => function (bool $granted): void {
            $ministry = actingAsMemberWithKey(Permission::MinistryEdit, $granted);

            test()->patchJson("/api/v1/ministries/{$ministry->id}", ['description' => 'Новое описание'])
                ->assertStatus($granted ? 200 : 403);
        },
    ];
}

it('refuses without the key and allows with it', function (Permission $permission, bool $granted) {
    $cases = permissionCases();

    expect(array_key_exists($permission->value, $cases))
        ->toBeTrue("Для права {$permission->value} нет проверки «без права запрещено, с правом разрешено».");

    $cases[$permission->value]($granted);
})->with(Permission::cases())->with([
    'without the key' => false,
    'with the key' => true,
]);
