<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('applies the same visibility rules to cards and the list', function (string $actor, array $expected) {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $events = [
        'church' => Event::factory()->create(),
        'church_assigned' => Event::factory()->visibility(EventVisibility::Assigned)->create(),
        'ministry' => Event::factory()->ministry($ministry)->create(),
        'ministry_assigned' => Event::factory()->ministry($ministry)->visibility(EventVisibility::Assigned)->create(),
        'other' => Event::factory()->ministry($other)->create(),
        'other_assigned' => Event::factory()->ministry($other)->visibility(EventVisibility::Assigned)->create(),
        'required_role' => Event::factory()->visibility(EventVisibility::Assigned)->create(),
        'other_role' => Event::factory()->visibility(EventVisibility::Assigned)->create(),
    ];
    EventSlot::factory()->for($events['required_role'])->withRole($ministry->roles()->findOrFail($ministry->default_role_id))->create();
    EventSlot::factory()->for($events['other_role'])->withRole($other->roles()->findOrFail($other->default_role_id))->create();
    $user = match ($actor) {
        'administrator' => actingAsAdministrator(),
        'view_all' => actingAsUserWith([Permission::MinistriesViewAll]),
        'manage_all' => actingAsUserWith([Permission::MinistriesManageAll]),
        'church_manager' => actingAsUserWith([Permission::CalendarChurchManage]),
        default => actingAsUser(),
    };
    if (in_array($actor, ['member', 'manager', 'assigner'], true)) {
        $role = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Проверяемая']);
        if ($actor !== 'member') {
            $role->permissions()->create(['permission' => $actor === 'manager' ? Permission::EventsManage->value : Permission::SlotsAssign->value]);
        }
        memberOf($ministry, $user->person, [$role->id]);
    }
    if ($actor === 'assigned') {
        foreach (['church_assigned', 'ministry_assigned'] as $name) {
            EventAssignment::factory()->for(EventSlot::factory()->for($events[$name])->create())->for($user->person)->create();
        }
    }

    foreach ($events as $name => $event) {
        $allowed = in_array($name, $expected, true);
        expect(app(EventAccess::class)->canView($user, $event))->toBe($allowed, $name);
        $this->getJson("/api/v1/events/{$event->id}")->assertStatus($allowed ? 200 : 403);
    }
    $ids = collect($this->getJson('/api/v1/events')->assertOk()->json('data'))->pluck('id')->all();
    expect($ids)->toEqualCanonicalizing(array_map(fn (string $name): string => $events[$name]->id, $expected));
})->with([
    'plain' => ['plain', ['church']],
    'member' => ['member', ['church', 'ministry']],
    'assigned' => ['assigned', ['church', 'church_assigned', 'ministry_assigned']],
    'owner manager' => ['manager', ['church', 'ministry', 'ministry_assigned']],
    'slot assigner' => ['assigner', ['church', 'ministry', 'required_role']],
    'church manager' => ['church_manager', ['church', 'church_assigned', 'required_role', 'other_role']],
    'view all' => ['view_all', ['church', 'ministry', 'ministry_assigned', 'other', 'other_assigned']],
    'manage all without membership' => ['manage_all', ['church', 'ministry', 'ministry_assigned', 'other', 'other_assigned', 'required_role', 'other_role']],
    'administrator without membership' => ['administrator', ['church', 'church_assigned', 'ministry', 'ministry_assigned', 'other', 'other_assigned', 'required_role', 'other_role']],
]);

it('excludes archived events slots and assignments from access and mine', function () {
    $user = actingAsUser();
    $active = Event::factory()->visibility(EventVisibility::Assigned)->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($active)->create())->for($user->person)->create();
    $removed = Event::factory()->visibility(EventVisibility::Assigned)->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($removed)->create())->for($user->person)->create(['archived_at' => now()]);
    $removedSlot = Event::factory()->visibility(EventVisibility::Assigned)->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($removedSlot)->create(['archived_at' => now()]))->for($user->person)->create();
    $archived = Event::factory()->create(['archived_at' => now()]);

    foreach ([$removed, $removedSlot, $archived] as $event) {
        expect(app(EventAccess::class)->canView($user, $event))->toBeFalse();
        $this->getJson("/api/v1/events/{$event->id}")->assertForbidden();
    }
    $this->getJson('/api/v1/events?scope=mine')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $active->id);
    $this->getJson('/api/v1/events')->assertOk()->assertJsonCount(1, 'data');
    app('auth')->forgetGuards();
    actingAsAdministrator();
    $this->getJson("/api/v1/events/{$archived->id}")->assertOk();
    $this->getJson('/api/v1/events')->assertOk()->assertJsonMissing(['id' => $archived->id]);
});

it('does not grant visibility through an archived required slot or ministry', function (bool $archiveMinistry) {
    $ministry = ministryWithRoles();
    $user = actingAsUserWith([Permission::MinistriesManageAll]);
    $event = Event::factory()->visibility(EventVisibility::Assigned)->create();
    EventSlot::factory()->for($event)->withRole($ministry->roles()->findOrFail($ministry->default_role_id))
        ->create(['archived_at' => $archiveMinistry ? null : now()]);
    if ($archiveMinistry) {
        $ministry->update(['archived_at' => now()]);
    }

    expect(app(EventAccess::class)->canView($user, $event))->toBeFalse();
    $this->getJson("/api/v1/events/{$event->id}")->assertForbidden();
    $this->getJson('/api/v1/events')->assertOk()->assertJsonCount(0, 'data');
})->with([false, true]);

it('keeps cancellation under the same visibility rules', function () {
    actingAsUser();
    $public = Event::factory()->cancelled()->create();
    $private = Event::factory()->cancelled()->visibility(EventVisibility::Assigned)->create();

    $this->getJson("/api/v1/events/{$public->id}")->assertOk()->assertJsonPath('data.status', 'cancelled');
    $this->getJson("/api/v1/events/{$private->id}")->assertForbidden();
    $this->getJson('/api/v1/events')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.status', 'cancelled');
});

it('keeps owner management visible after the owner ministry is archived', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUserWith([Permission::MinistriesManageAll]);
    $event = Event::factory()->ministry($ministry)->visibility(EventVisibility::Assigned)->cancelled()->create();
    $ministry->update(['archived_at' => now()]);

    expect(app(EventAccess::class)->canView($user, $event))->toBeTrue();
    $this->getJson("/api/v1/events/{$event->id}")->assertOk();
    $this->getJson('/api/v1/events')->assertOk()->assertJsonPath('data.0.id', $event->id);
});

it('rejects disabled viewers in the shared visibility service', function () {
    $user = actingAsUser(null, ['disabled_at' => now()]);
    $event = Event::factory()->create();

    expect(app(EventAccess::class)->canView($user, $event))->toBeFalse()
        ->and(app(EventAccess::class)->constrainVisibleQuery(Event::query(), $user)->exists())->toBeFalse();
});
