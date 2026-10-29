<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Actions\UpdateTemplate;
use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use App\Support\DomainRuleException;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function churchTemplate(array $over = []): array
{
    return [
        'owner_type' => 'church', 'title' => 'Воскресное служение', 'visibility' => 'church',
        'start_time' => '10:00', 'duration_minutes' => 120,
        'recurrence' => ['type' => 'weekly', 'weekday' => 7], 'slots' => [], ...$over,
    ];
}

it('requires owner management permission for template mutations', function () {
    actingAsUser();
    $template = EventTemplate::factory()->create();
    $this->postJson('/api/v1/templates', churchTemplate())->assertForbidden();
    $this->patchJson("/api/v1/templates/{$template->id}", ['title' => 'Правка'])->assertForbidden();
    $this->postJson("/api/v1/templates/{$template->id}/archive")->assertForbidden();
});

it('creates a weekly template with role and free slots', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::CalendarChurchManage]);
    $this->postJson('/api/v1/templates', churchTemplate(['slots' => [
        ['role_id' => $ministry->default_role_id, 'required_count' => 2],
        ['label' => 'Звук', 'required_count' => 1],
    ]]))->assertCreated()->assertJsonPath('data.recurrence.type', 'weekly')
        ->assertJsonPath('data.start_time', '10:00')->assertJsonPath('data.active', true)
        ->assertJsonPath('data.generated_until', null)->assertJsonPath('data.can_manage', true)
        ->assertJsonPath('data.slots.0.label', 'Участник')->assertJsonPath('data.slots.0.role.id', $ministry->default_role_id)
        ->assertJsonPath('data.slots.1.sort_order', 1)->assertJsonPath('data.slots.1.role', null);
    expect(EventTemplate::query()->sole()->created_by_user_id)->toBe(auth()->id());
});

it('allows a template with no recurrence and removing recurrence on partial edit', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $id = $this->postJson('/api/v1/templates', churchTemplate(['recurrence' => null]))->assertCreated()->assertJsonPath('data.recurrence', null)->json('data.id');
    $this->patchJson("/api/v1/templates/$id", ['recurrence' => ['type' => 'monthly_nth_weekday', 'weekday' => 2, 'nth' => -1]])->assertOk()->assertJsonPath('data.recurrence.nth', -1);
    $this->patchJson("/api/v1/templates/$id", ['recurrence' => null])->assertOk()->assertJsonPath('data.recurrence', null);
});

it('validates template inputs', function (array $over, string $field) {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $this->postJson('/api/v1/templates', churchTemplate($over))->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    [['recurrence' => ['type' => 'biweekly', 'weekday' => 7]], 'recurrence'],
    [['recurrence' => ['type' => 'biweekly', 'weekday' => 7, 'anchor_date' => '2026-02-30']], 'recurrence'],
    [['recurrence' => 'weekly'], 'recurrence'],
    [['start_time' => '25:00'], 'start_time'],
    [['start_time' => '10:00:00'], 'start_time'],
    [['duration_minutes' => 14], 'duration_minutes'],
    [['duration_minutes' => 1441], 'duration_minutes'],
    [['visibility' => 'ministry'], 'visibility'],
    [['slots' => [['label' => 'Звук', 'required_count' => 0]]], 'slots.0.required_count'],
]);

it('reuses slot domain validation and rolls back invalid creation', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $global = Role::factory()->global()->create();
    $this->postJson('/api/v1/templates', churchTemplate(['slots' => [['required_count' => 1]]]))->assertUnprocessable()->assertJsonPath('code', 'slot.label_required');
    $this->postJson('/api/v1/templates', churchTemplate(['slots' => [['role_id' => $global->id, 'required_count' => 1]]]))->assertUnprocessable()->assertJsonPath('code', 'slot.role_not_ministry');
    $ministry = ministryWithRoles();
    $ministry->update(['archived_at' => now()]);
    $this->postJson('/api/v1/templates', churchTemplate(['slots' => [['role_id' => $ministry->default_role_id, 'required_count' => 1]]]))->assertUnprocessable()->assertJsonPath('code', 'slot.role_archived_ministry');
    expect(EventTemplate::query()->count())->toBe(0);
});

it('lets a ministry manager manage only their ministry templates', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);
    $id = $this->postJson('/api/v1/templates', churchTemplate(['owner_type' => 'ministry', 'ministry_id' => $ministry->id, 'visibility' => 'ministry']))->assertCreated()->json('data.id');
    $this->patchJson("/api/v1/templates/$id", ['title' => 'Правка'])->assertOk();
    $this->postJson('/api/v1/templates', churchTemplate(['owner_type' => 'ministry', 'ministry_id' => $other->id]))->assertForbidden();
    $this->postJson('/api/v1/templates', churchTemplate())->assertForbidden();
    $foreign = EventTemplate::factory()->ministry($other)->create();
    $this->patchJson("/api/v1/templates/{$foreign->id}", ['active' => false])->assertForbidden();
    $this->postJson("/api/v1/templates/$id/archive")->assertOk();
});

it('lets ministries.manage_all manage any ministry template', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $ministry = ministryWithRoles();
    $this->postJson('/api/v1/templates', churchTemplate(['owner_type' => 'ministry', 'ministry_id' => $ministry->id]))->assertCreated();
});

it('keeps owner immutable and validates effective visibility during partial updates', function () {
    actingAsUserWith([Permission::CalendarChurchManage, Permission::MinistriesManageAll]);
    $ministry = ministryWithRoles();
    $template = EventTemplate::factory()->ministry($ministry)->create();
    $this->patchJson("/api/v1/templates/{$template->id}", ['owner_type' => 'church'])->assertUnprocessable()->assertJsonValidationErrors('owner_type');
    $this->patchJson("/api/v1/templates/{$template->id}", ['title' => 'Правка', 'owner_type' => null, 'ministry_id' => null, 'generated_until' => '2030-01-01'])
        ->assertOk()->assertJsonPath('data.owner_type', 'ministry')->assertJsonPath('data.ministry.id', $ministry->id)->assertJsonPath('data.generated_until', null);
    $church = EventTemplate::factory()->create();
    $this->patchJson("/api/v1/templates/{$church->id}", ['visibility' => 'ministry'])->assertUnprocessable()->assertJsonValidationErrors('visibility');
});

it('archives replaced slots without touching event snapshots and preserves omitted slots', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->weekly(7)->create();
    $old = EventTemplateSlot::factory()->create(['template_id' => $template->id]);
    $event = Event::factory()->create(['template_id' => $template->id]);
    $snapshot = EventSlot::factory()->for($event)->create(['label' => 'История']);
    $this->patchJson("/api/v1/templates/{$template->id}", ['slots' => [['label' => 'Звук', 'required_count' => 2]], 'active' => false])
        ->assertOk()->assertJsonCount(1, 'data.slots')->assertJsonPath('data.active', false)->assertJsonPath('data.slots.0.label', 'Звук');
    expect($old->refresh()->archived_at)->not->toBeNull()->and($template->slots()->count())->toBe(2)->and($snapshot->refresh()->label)->toBe('История');
    $this->patchJson("/api/v1/templates/{$template->id}", ['title' => 'Правка'])->assertOk()->assertJsonCount(1, 'data.slots');
    $this->patchJson("/api/v1/templates/{$template->id}", ['slots' => []])->assertOk()->assertJsonCount(0, 'data.slots');
});

it('archives deactivates and rejects stale action edits of an archived template', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->create();
    $this->postJson("/api/v1/templates/{$template->id}/archive")->assertOk()->assertJsonPath('data.archived', true)->assertJsonPath('data.active', false);
    $this->getJson('/api/v1/templates')->assertOk()->assertJsonCount(0, 'data');
    $this->getJson('/api/v1/templates?archived=1')->assertOk()->assertJsonCount(1, 'data');
    $this->getJson("/api/v1/templates/{$template->id}")->assertOk();
    $this->patchJson("/api/v1/templates/{$template->id}", ['active' => true])->assertUnprocessable()->assertJsonPath('code', 'template.archived');
    expect(fn () => app(UpdateTemplate::class)->handle($template, ['title' => 'Stale']))->toThrow(DomainRuleException::class);
});

it('keeps list and card visibility identical and ministry scope only narrows', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    memberOf($ministry, $user->person);
    $church = EventTemplate::factory()->create();
    $own = EventTemplate::factory()->ministry($ministry)->create(['visibility' => 'assigned', 'active' => false]);
    $hidden = [EventTemplate::factory()->create(['visibility' => 'assigned']), EventTemplate::factory()->ministry($other)->create(['visibility' => 'church']), EventTemplate::factory()->archived()->create()];
    $this->getJson('/api/v1/templates?scope=church')->assertOk()->assertJsonCount(2, 'data');
    foreach ([$church, $own] as $template) {
        $this->getJson("/api/v1/templates/{$template->id}")->assertOk()->assertJsonPath('data.can_manage', false);
    }
    foreach ($hidden as $template) {
        $this->getJson("/api/v1/templates/{$template->id}")->assertForbidden();
    }
    $this->getJson("/api/v1/templates?scope=ministry:{$ministry->id}")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $own->id);
    $this->getJson('/api/v1/templates?archived=1')->assertOk()->assertJsonCount(2, 'data');
});

it('allows view_all to read ministry templates but not to mutate them', function () {
    actingAsUserWith([Permission::MinistriesViewAll]);
    $template = EventTemplate::factory()->ministry(ministryWithRoles())->create(['visibility' => 'assigned']);
    $this->getJson('/api/v1/templates')->assertOk()->assertJsonCount(1, 'data');
    $this->getJson("/api/v1/templates/{$template->id}")->assertOk()->assertJsonPath('data.can_manage', false);
    $this->patchJson("/api/v1/templates/{$template->id}", ['active' => false])->assertForbidden();
});

it('rejects disabled actors and malformed template filters', function () {
    $user = actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->create();
    foreach (['mine', 'invalid', 'ministry:nope', 'church-extra'] as $scope) {
        $this->getJson("/api/v1/templates?scope=$scope")->assertUnprocessable()->assertJsonValidationErrors('scope');
    }
    $this->getJson('/api/v1/templates?archived=maybe')->assertUnprocessable()->assertJsonValidationErrors('archived');
    $user->update(['disabled_at' => now()]);
    expect(app(EventAccess::class)->canManageTemplate($user->refresh(), $template))->toBeFalse();
    $this->getJson("/api/v1/templates/{$template->id}")->assertForbidden();
});

it('rolls back field and slot changes if a replacement slot is invalid', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $template = EventTemplate::factory()->create(['title' => 'До правки']);
    $slot = EventTemplateSlot::factory()->create(['template_id' => $template->id]);
    $this->patchJson("/api/v1/templates/{$template->id}", ['title' => 'После правки', 'slots' => [['required_count' => 1]]])
        ->assertUnprocessable()->assertJsonPath('code', 'slot.label_required');
    expect($template->refresh()->title)->toBe('До правки')->and($slot->refresh()->archived_at)->toBeNull();
});

it('documents typed recurrence slots and optional partial updates', function () {
    $schema = app(Generator::class)();
    $schemas = $schema['components']['schemas'];
    $store = $schemas['TemplateRequest'];
    $update = $schemas['UpdateTemplateRequest'];
    expect($store['required'])->toContain('owner_type', 'title', 'visibility', 'start_time', 'duration_minutes')
        ->and($update['required'] ?? [])->toBe([])
        ->and($update['properties']['owner_type'])->toBeFalse()
        ->and($update['properties']['ministry_id'])->toBeFalse()
        ->and($store['properties']['start_time']['pattern'])->toBe('^([01][0-9]|2[0-3]):[0-5][0-9]$')
        ->and($store['properties']['recurrence']['anyOf'][0]['oneOf'][1]['required'])->toContain('anchor_date')
        ->and($store['properties']['recurrence']['anyOf'][0]['oneOf'][2]['properties']['nth']['enum'])->toBe([-1, 1, 2, 3, 4, 5])
        ->and($store['properties']['slots']['items']['properties']['required_count']['minimum'])->toEqual(1)
        ->and($store['properties']['slots']['items']['properties']['role_id']['format'])->toBe('ulid');
    $resource = $schemas['EventTemplateResource']['properties'];
    expect($resource['active']['type'])->toBe('boolean')
        ->and($resource['can_manage']['type'])->toBe('boolean')
        ->and($resource['slots']['items'])->toBe(['$ref' => '#/components/schemas/EventTemplateSlotResource'])
        ->and($resource['recurrence']['anyOf'][0]['oneOf'][0]['properties']['type']['const'])->toBe('weekly');
    $slotResource = $schemas['EventTemplateSlotResource']['properties'];
    expect($slotResource['role']['properties']['name']['type'])->toBe('string')
        ->and($slotResource['role']['type'])->toBe(['object', 'null']);
});
