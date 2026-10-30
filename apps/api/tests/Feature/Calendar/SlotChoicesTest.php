<?php

declare(strict_types=1);
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);
it('denies choices without calendar management', function () {
    actingAsUser();
    $this->getJson('/api/v1/calendar/slot-choices?owner_type=church')->assertForbidden();
});
it('returns minimal active ministry roles with calendar permission only', function () {
    Role::factory()->create(['name' => 'Глобальная']);
    $live = ministryWithRoles();
    $archived = ministryWithRoles('Архив');
    $archived->update(['archived_at' => now()]);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $r = $this->getJson('/api/v1/calendar/slot-choices?owner_type=church')->assertOk()->assertJsonCount(1, 'data');
    expect(array_keys($r->json('data.0')))->toBe(['id', 'name', 'roles']);
    expect(array_keys($r->json('data.0.roles.0')))->toBe(['id', 'name']);
    expect($r->json('data.0.id'))->toBe($live->id);
});
it('validates active owner even for manage all', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $archived = ministryWithRoles();
    $archived->update(['archived_at' => now()]);
    foreach ([$archived->id, '01ARZ3NDEKTSV4RRFFQ69G5FAV'] as $id) {
        $this->getJson('/api/v1/calendar/slot-choices?owner_type=ministry&ministry_id='.$id)->assertUnprocessable();
    }
    $this->getJson('/api/v1/calendar/slot-choices?owner_type=church&ministry_id='.$archived->id)->assertUnprocessable();
});

it('allows only events.manage of the chosen ministry owner without role permissions', function () {
    $mine = ministryWithRoles();
    $other = ministryWithRoles('Другое');
    $user = actingAsUser();
    $role = $mine->roles()->where('id', $mine->default_role_id)->sole();
    $role->permissions()->create(['permission' => Permission::EventsManage->value]);
    memberOf($mine, $user->person, [$role->id]);
    $this->getJson('/api/v1/calendar/slot-choices?owner_type=ministry&ministry_id='.$mine->id)->assertOk()->assertJsonCount(2, 'data');
    $this->getJson('/api/v1/calendar/slot-choices?owner_type=ministry&ministry_id='.$other->id)->assertForbidden();
    $this->getJson('/api/v1/calendar/slot-choices?owner_type=church')->assertForbidden();
});
