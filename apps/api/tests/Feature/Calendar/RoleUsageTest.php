<?php

declare(strict_types=1);

use App\Modules\Access\Actions\DeleteRole;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('documents role blockers as a list of typed objects for every usage source', function () {
    $schema = app(Generator::class)();
    $blockers = $schema['paths']['/roles/{role}/usage']['get']['responses']['200']['content']['application/json']['schema']['properties']['data']['properties']['blockers'];

    expect($blockers['type'])->toBe('array')
        ->and($blockers)->toHaveKey('items')
        ->and($blockers['items']['type'])->toBe('object');
    foreach (['type', 'id', 'title'] as $field) {
        expect($blockers['items']['properties'][$field]['type'])->toBe('string')
            ->and($blockers['items']['required'])->toContain($field);
    }
});

function calendarUsageRole(): Role
{
    return Role::factory()->ministry(ministryWithRoles()->id)->create(['name' => 'Вокалист']);
}

it('blocks deletion until a scheduled event ends and reports each event once in church time', function (string $start, string $end) {
    $this->travelTo(CarbonImmutable::parse('2026-11-01 00:00:00 UTC'));
    app(ChurchSettings::class)->put(['church.timezone' => 'Europe/Moscow']);
    actingAsUserWith([Permission::MinistriesManageAll]);
    $role = calendarUsageRole();
    $event = Event::factory()->between(CarbonImmutable::parse($start), CarbonImmutable::parse($end))->create(['title' => 'Спевка']);
    EventSlot::factory()->count(2)->for($event)->withRole($role)->create();

    $this->getJson("/api/v1/roles/{$role->id}/usage")->assertOk()
        ->assertJsonCount(1, 'data.blockers')
        ->assertJsonPath('data.blockers.0.type', 'event_slot')
        ->assertJsonPath('data.blockers.0.id', $event->id)
        ->assertJsonPath('data.blockers.0.title', 'Спевка, 01.11.2026');
    $this->deleteJson("/api/v1/roles/{$role->id}")->assertUnprocessable()->assertJsonPath('code', 'role.in_use');
    expect($role->fresh())->not->toBeNull();
    expect($event->slots()->where('role_id', $role->id)->count())->toBe(2);
})->with([
    'future' => ['2026-11-01 18:00:00 UTC', '2026-11-01 20:00:00 UTC'],
    'ongoing across local midnight' => ['2026-10-31 23:00:00 UTC', '2026-11-01 01:00:00 UTC'],
]);

it('deletes roles referenced only by nonblocking event slots while preserving history', function (string $state) {
    $this->travelTo(CarbonImmutable::parse('2026-11-01 00:00:00 UTC'));
    actingAsUserWith([Permission::MinistriesManageAll]);
    $role = calendarUsageRole();
    $event = match ($state) {
        'ended' => Event::factory()->between(CarbonImmutable::now()->subHour(), CarbonImmutable::now())->create(),
        'cancelled' => Event::factory()->cancelled()->create(),
        'archived event' => Event::factory()->create(['archived_at' => now()]),
        default => Event::factory()->create(),
    };
    $slot = EventSlot::factory()->for($event)->withRole($role)->create([
        'archived_at' => $state === 'archived slot' ? now() : null,
    ]);

    $this->getJson("/api/v1/roles/{$role->id}/usage")->assertOk()->assertJsonPath('data.blockers', []);
    $this->deleteJson("/api/v1/roles/{$role->id}")->assertNoContent();
    expect($role->fresh())->toBeNull()
        ->and($slot->fresh()->role_id)->toBeNull()
        ->and($slot->fresh()->label)->toBe('Вокалист')
        ->and($event->fresh())->not->toBeNull();
})->with(['ended', 'cancelled', 'archived event', 'archived slot']);

it('reports each active template once and denies deletion', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $role = calendarUsageRole();
    $template = EventTemplate::factory()->weekly(7)->create(['title' => 'Воскресный шаблон']);
    EventTemplateSlot::factory()->count(2)->for($template, 'template')->withRole($role)->create();

    $this->getJson("/api/v1/roles/{$role->id}/usage")->assertOk()
        ->assertJsonCount(1, 'data.blockers')->assertJsonPath('data.blockers.0', [
            'type' => 'template_slot', 'id' => $template->id, 'title' => 'Воскресный шаблон',
        ]);
    $this->deleteJson("/api/v1/roles/{$role->id}")->assertUnprocessable()->assertJsonPath('code', 'role.in_use');
});

it('deletes roles referenced only by nonblocking template slots', function (string $state) {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $role = calendarUsageRole();
    $template = EventTemplate::factory()->create([
        'active' => $state !== 'inactive',
        'archived_at' => $state === 'archived template' ? now() : null,
    ]);
    $slot = EventTemplateSlot::factory()->for($template, 'template')->withRole($role)->create([
        'archived_at' => $state === 'archived slot' ? now() : null,
    ]);

    $this->getJson("/api/v1/roles/{$role->id}/usage")->assertOk()->assertJsonPath('data.blockers', []);
    $this->deleteJson("/api/v1/roles/{$role->id}")->assertNoContent();
    expect($role->fresh())->toBeNull()
        ->and($slot->fresh()->role_id)->toBeNull()
        ->and($slot->fresh()->label)->toBe('Вокалист')
        ->and($template->fresh())->not->toBeNull();
})->with(['inactive', 'archived template', 'archived slot']);

it('keeps historical references untouched when an active requirement still blocks deletion', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $role = calendarUsageRole();
    $historical = EventSlot::factory()->for(Event::factory()->cancelled())->withRole($role)->create();
    $active = EventTemplateSlot::factory()->withRole($role)->create();

    $this->deleteJson("/api/v1/roles/{$role->id}")->assertUnprocessable()->assertJsonPath('code', 'role.in_use');
    expect($historical->fresh()->role_id)->toBe($role->id)
        ->and($active->fresh()->role_id)->toBe($role->id);
});

it('blocks hidden dependencies without exposing their titles or dates', function () {
    $role = calendarUsageRole();
    $user = actingAsUser();
    $manager = Role::factory()->ministry($role->ministry_id)->withPermissions([Permission::RolesManage])->create();
    memberOf(Ministry::query()->findOrFail($role->ministry_id), $user->person, [$manager->id]);
    $privateMinistry = ministryWithRoles('Другое служение');
    $event = Event::factory()->ministry($privateMinistry)->create(['title' => 'Секретное событие']);
    $template = EventTemplate::factory()->ministry($privateMinistry)->create(['title' => 'Секретный шаблон']);
    EventSlot::factory()->for($event)->withRole($role)->create();
    EventTemplateSlot::factory()->for($template, 'template')->withRole($role)->create();

    $this->getJson("/api/v1/roles/{$role->id}/usage")->assertOk()->assertJsonPath('data.blockers', [
        ['type' => 'event_slot', 'id' => $event->id, 'title' => 'Скрытое событие'],
        ['type' => 'template_slot', 'id' => $template->id, 'title' => 'Скрытый шаблон'],
    ]);
    $this->deleteJson("/api/v1/roles/{$role->id}")->assertUnprocessable()->assertJsonPath('code', 'role.in_use');
});

it('reveals template titles only through owner visibility or management', function (string $actor, bool $visible) {
    $role = calendarUsageRole();
    $owner = ministryWithRoles('Владелец шаблона');
    $user = actingAsUserWith(match ($actor) {
        'view all' => [Permission::MinistriesViewAll],
        'manage all' => [Permission::MinistriesManageAll],
        'church manager' => [Permission::CalendarChurchManage],
        default => [],
    });
    $permissions = $actor === 'slot assigner' ? [Permission::RolesManage, Permission::SlotsAssign] : [Permission::RolesManage];
    memberOf(Ministry::query()->findOrFail($role->ministry_id), $user->person, [Role::factory()->ministry($role->ministry_id)->withPermissions($permissions)->create()->id]);
    if (in_array($actor, ['member', 'manager'], true)) {
        memberOf($owner, $user->person, [Role::factory()->ministry($owner->id)->withPermissions($actor === 'manager' ? [Permission::EventsManage] : [])->create()->id]);
    }
    $template = in_array($actor, ['church manager', 'church private', 'church public'], true)
        ? EventTemplate::factory()->create(['visibility' => $actor === 'church public' ? EventVisibility::Church : EventVisibility::Assigned, 'title' => 'Шаблон'])
        : EventTemplate::factory()->ministry($owner)->create(['visibility' => EventVisibility::Assigned, 'title' => 'Шаблон']);
    EventTemplateSlot::factory()->for($template, 'template')->withRole($role)->create();

    $this->getJson("/api/v1/roles/{$role->id}/usage")->assertOk()
        ->assertJsonPath('data.blockers.0.title', $visible ? 'Шаблон' : 'Скрытый шаблон');
})->with([
    'owner member' => ['member', true],
    'owner manager' => ['manager', true],
    'view all' => ['view all', true],
    'manage all' => ['manage all', true],
    'church manager' => ['church manager', true],
    'public church template' => ['church public', true],
    'private church template' => ['church private', false],
    'slot assigner is not owner member' => ['slot assigner', false],
]);

it('checks current requirements again after a usage preview', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $role = calendarUsageRole();
    $slot = EventTemplateSlot::factory()->for(EventTemplate::factory()->inactive(), 'template')->withRole($role)->create();
    $this->getJson("/api/v1/roles/{$role->id}/usage")->assertOk()->assertJsonPath('data.blockers', []);

    $slot->template->update(['active' => true]);
    $this->deleteJson("/api/v1/roles/{$role->id}")->assertUnprocessable()->assertJsonPath('code', 'role.in_use');
    expect($slot->fresh()->role_id)->toBe($role->id);
});

it('rolls historical detachment back if role deletion fails', function () {
    $role = calendarUsageRole();
    $eventSlot = EventSlot::factory()->for(Event::factory()->cancelled())->withRole($role)->create();
    $templateSlot = EventTemplateSlot::factory()->for(EventTemplate::factory()->inactive(), 'template')->withRole($role)->create();
    Role::deleting(function (): never {
        throw new RuntimeException('Deletion interrupted');
    });

    try {
        expect(fn () => app(DeleteRole::class)->handle($role))
            ->toThrow(RuntimeException::class, 'Deletion interrupted');
        expect($role->fresh())->not->toBeNull()
            ->and($eventSlot->fresh()->role_id)->toBe($role->id)
            ->and($templateSlot->fresh()->role_id)->toBe($role->id);
    } finally {
        Role::flushEventListeners();
    }
});
