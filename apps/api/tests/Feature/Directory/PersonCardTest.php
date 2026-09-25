<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('includes global role summaries without exposing their permissions', function () {
    actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create();
    $role = Role::factory()->global()->withPermissions([Permission::PeopleInvite])->create(['name' => 'Приглашающий']);
    $person->globalRoles()->attach($role);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonPath('data.global_roles', [['id' => $role->id, 'name' => 'Приглашающий']])
        ->assertJsonMissingPath('data.contacts')
        ->assertJsonMissingPath('data.note');
});

it('shows only active ministries the viewer can see', function () {
    $viewer = actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create();
    $shared = ministryWithRoles('Хор');
    $hidden = ministryWithRoles('Детское служение');
    $archived = ministryWithRoles('Архивное служение');
    foreach ([$shared, $hidden, $archived] as $ministry) {
        memberOf($ministry, $person);
    }
    memberOf($shared, $viewer->person);
    memberOf($archived, $viewer->person);
    $archived->update(['archived_at' => now()]);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonPath('data.ministries', [['id' => $shared->id, 'name' => 'Хор']]);
});

it('includes ministries for holders of church-wide ministry rights', function (Permission $permission) {
    actingAsUserWith([Permission::PeopleView, $permission]);
    $person = Person::factory()->create();
    $ministry = ministryWithRoles('Хор');
    memberOf($ministry, $person);

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonPath('data.ministries', [['id' => $ministry->id, 'name' => 'Хор']]);
})->with([Permission::MinistriesViewAll, Permission::MinistriesManageAll]);

it('returns empty associations in a card without expanding list responses', function () {
    actingAsUserWith([Permission::PeopleView]);
    $person = Person::factory()->create();

    $this->getJson("/api/v1/people/{$person->id}")
        ->assertOk()
        ->assertJsonPath('data.global_roles', [])
        ->assertJsonPath('data.ministries', []);

    $this->getJson('/api/v1/people')->assertOk()
        ->assertJsonMissingPath('data.0.global_roles')
        ->assertJsonMissingPath('data.0.ministries');
});
