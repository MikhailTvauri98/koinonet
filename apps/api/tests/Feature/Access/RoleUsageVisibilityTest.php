<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('applies person visibility to role blockers without allowing deletion', function (bool $canRead, bool $own, string $operation) {
    $viewer = actingAsUserWith($canRead ? [Permission::PeopleView] : []);
    $ministry = ministryWithRoles();
    $role = Role::factory()->ministry($ministry->id)->withPermissions([Permission::RolesManage])->create();
    $person = $own ? $viewer->person : Person::factory()->create();
    $person->update(['last_name' => 'Иванов', 'first_name' => 'Иван', 'patronymic' => null]);
    $member = memberOf($ministry, $person, [$role->id]);
    $member->roles()->sync([$role->id]);
    if (! $own) {
        $manager = Role::factory()->ministry($ministry->id)->withPermissions([Permission::RolesManage])->create();
        memberOf($ministry, $viewer->person, [$manager->id]);
    }

    $visible = $canRead || $own;
    $this->getJson("/api/v1/people/{$person->id}")->assertStatus($visible ? 200 : 403);
    $title = $visible ? 'Иванов Иван' : 'Скрытый человек';
    if ($operation === 'usage') {
        $this->getJson("/api/v1/roles/{$role->id}/usage")->assertOk()
            ->assertJsonPath('data.carriers', 1)
            ->assertJsonPath('data.blockers', [['type' => 'last_role_of_member', 'id' => $member->id, 'title' => $title]]);
    } else {
        $response = $this->deleteJson("/api/v1/roles/{$role->id}")
            ->assertUnprocessable()->assertJsonPath('code', 'role.last_role_of_member');
        expect($response->json('message'))->toContain($title);
        if (! $visible) {
            expect($response->getContent())->not->toContain('Иванов');
        }
    }
    expect($role->fresh())->not->toBeNull()
        ->and($member->fresh()->roles()->pluck('roles.id')->all())->toBe([$role->id]);
})->with(['hidden' => [false, false], 'reader' => [true, false], 'self' => [false, true]])
    ->with(['usage', 'delete']);
