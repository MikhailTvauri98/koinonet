<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Events\EventChanged;
use App\Modules\Calendar\Events\EventCreated;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Directory\Models\Person;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event as EventBus;

uses(RefreshDatabase::class);

function churchEvent(array $over = []): array
{
    return [
        'owner_type' => 'church', 'title' => 'Воскресное служение',
        'starts_at' => '2026-11-08T07:00:00Z', 'ends_at' => '2026-11-08T09:00:00Z',
        'visibility' => 'church', 'slots' => [], ...$over,
    ];
}

it('denies creating a church event without calendar.church.manage', function () {
    actingAsUserWith([Permission::PeopleView]);

    $this->postJson('/api/v1/events', churchEvent())->assertForbidden();
});

it('creates a church event with slots and derives labels from roles', function () {
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['slots' => [
        ['role_id' => $vocalist->id, 'required_count' => 2],
        ['label' => 'Встречающий', 'required_count' => 1],
    ]]))->assertCreated()
        ->assertJsonPath('data.slots.0.label', 'Вокалист')
        ->assertJsonPath('data.slots.0.role.id', $vocalist->id)
        ->assertJsonPath('data.slots.0.required_count', 2)
        ->assertJsonPath('data.slots.1.label', 'Встречающий')
        ->assertJsonPath('data.slots.1.role', null)
        ->assertJsonPath('data.can_manage', true);
});

it('lets a slot label override the role name', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['slots' => [
        ['role_id' => $ministry->default_role_id, 'label' => 'Любой участник', 'required_count' => 3],
    ]]))->assertCreated()->assertJsonPath('data.slots.0.label', 'Любой участник');
});

it('refuses a free slot without a label', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['slots' => [['required_count' => 1]]]))
        ->assertStatus(422)->assertJsonPath('code', 'slot.label_required');
});

it('refuses a global role as a slot requirement', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $global = Role::factory()->global()->create();

    $this->postJson('/api/v1/events', churchEvent(['slots' => [['role_id' => $global->id, 'required_count' => 1]]]))
        ->assertStatus(422)->assertJsonPath('code', 'slot.role_not_ministry');
});

it('refuses ministry visibility on a church event', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['visibility' => 'ministry']))
        ->assertStatus(422)->assertJsonValidationErrors('visibility');
});

it('refuses an end before the start', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['ends_at' => '2026-11-08T06:00:00Z']))
        ->assertStatus(422)->assertJsonValidationErrors('ends_at');
});

it('denies creating a ministry event without events.manage in that ministry', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $this->postJson('/api/v1/events', churchEvent(['owner_type' => 'ministry', 'ministry_id' => $ministry->id]))
        ->assertForbidden();
});

it('lets a leader create a ministry event and manage it', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    $this->postJson('/api/v1/events', churchEvent(['owner_type' => 'ministry', 'ministry_id' => $ministry->id, 'visibility' => 'ministry']))
        ->assertCreated()
        ->assertJsonPath('data.ministry.id', $ministry->id)
        ->assertJsonPath('data.can_manage', true);
});

it('does not let a ministry leader create a church event', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    $this->postJson('/api/v1/events', churchEvent())->assertForbidden();
});

it('lets ministries.manage_all create an event for any ministry', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson('/api/v1/events', churchEvent(['owner_type' => 'ministry', 'ministry_id' => $ministry->id]))
        ->assertCreated();
});

it('validates the notify flag against the owner', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::CalendarChurchManage, Permission::MinistriesManageAll]);

    $this->postJson('/api/v1/events', churchEvent(['notify' => 'ministry']))
        ->assertStatus(422)->assertJsonValidationErrors('notify');

    $this->postJson('/api/v1/events', churchEvent(['owner_type' => 'ministry', 'ministry_id' => $ministry->id, 'notify' => 'all']))
        ->assertStatus(422)->assertJsonValidationErrors('notify');
});

it('publishes EventCreated with the notify flag', function () {
    EventBus::fake([EventCreated::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);

    $this->postJson('/api/v1/events', churchEvent(['notify' => 'all']))->assertCreated();

    EventBus::assertDispatched(EventCreated::class, fn (EventCreated $e) => $e->notify === 'all');
});

it('updates the time and publishes EventChanged with the changed fields', function () {
    EventBus::fake([EventChanged::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();

    $this->patchJson("/api/v1/events/{$event->id}", ['starts_at' => '2026-11-08T08:00:00Z', 'ends_at' => '2026-11-08T10:00:00Z', 'location' => 'Зал 2'])
        ->assertOk()->assertJsonPath('data.location', 'Зал 2');

    EventBus::assertDispatched(EventChanged::class, fn (EventChanged $e) => $e->changed === ['starts_at', 'ends_at', 'location']);
});

it('denies reading restricted events to an unrelated viewer', function () {
    actingAsUser();
    $event = Event::factory()->create(['visibility' => 'assigned']);
    $this->getJson("/api/v1/events/{$event->id}")->assertForbidden();
});

it('denies changing an event without its owner management permission', function () {
    actingAsUser();
    $event = Event::factory()->create();
    $this->patchJson("/api/v1/events/{$event->id}", ['title' => 'Правка'])->assertForbidden();
});

it('ignores empty prohibited fields instead of writing them to event columns', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $ministry = ministryWithRoles();
    $event = Event::factory()->ministry($ministry)->create();
    $this->patchJson("/api/v1/events/{$event->id}", [
        'title' => 'Новый заголовок', 'owner_type' => null, 'ministry_id' => null,
        'slots' => [], 'notify' => null, 'media_ids' => [],
    ])->assertOk()->assertJsonPath('data.title', 'Новый заголовок')
        ->assertJsonPath('data.owner_type', 'ministry')->assertJsonPath('data.ministry.id', $ministry->id);
});

it('validates partial time changes against the saved other endpoint', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create(['starts_at' => '2026-11-08T07:00:00Z', 'ends_at' => '2026-11-08T09:00:00Z']);
    $this->patchJson("/api/v1/events/{$event->id}", ['starts_at' => '2026-11-08T10:00:00Z'])->assertUnprocessable()->assertJsonValidationErrors('ends_at');
    $this->patchJson("/api/v1/events/{$event->id}", ['ends_at' => '2026-11-08T06:00:00Z'])->assertUnprocessable()->assertJsonValidationErrors('ends_at');
    $this->patchJson("/api/v1/events/{$event->id}", ['ends_at' => '2026-11-08T10:00:00+03:00'])->assertUnprocessable();
});

it('does not notify for equivalent time instants and normalizes offsets to UTC', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create(['starts_at' => '2026-11-08T07:00:00Z', 'ends_at' => '2026-11-08T09:00:00Z']);
    EventBus::fake([EventChanged::class]);
    $this->patchJson("/api/v1/events/{$event->id}", ['starts_at' => '2026-11-08T10:00:00+03:00'])->assertOk()->assertJsonPath('data.starts_at', '2026-11-08T07:00:00.000000Z');
    EventBus::assertNotDispatched(EventChanged::class);
});

it('refuses invalid visibility and notification combinations', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $this->postJson('/api/v1/events', churchEvent(['visibility' => 'ministry']))->assertUnprocessable()->assertJsonValidationErrors('visibility');
    $event = Event::factory()->create();
    $this->patchJson("/api/v1/events/{$event->id}", ['visibility' => 'ministry'])->assertUnprocessable()->assertJsonValidationErrors('visibility');
});

it('refuses archived ministry owners and slot roles from archived ministries', function () {
    $ministry = ministryWithRoles();
    $ministry->update(['archived_at' => now()]);
    actingAsUserWith([Permission::CalendarChurchManage, Permission::MinistriesManageAll]);
    $this->postJson('/api/v1/events', churchEvent(['owner_type' => 'ministry', 'ministry_id' => $ministry->id]))->assertUnprocessable()->assertJsonValidationErrors('ministry_id');
    $this->postJson('/api/v1/events', churchEvent(['slots' => [['role_id' => $ministry->default_role_id, 'required_count' => 1]]]))->assertUnprocessable()->assertJsonPath('code', 'slot.role_archived_ministry');
});

it('shows only active slots and assignments while preserving history', function () {
    actingAsUser();
    $event = Event::factory()->create();
    $active = EventSlot::factory()->for($event)->create();
    EventSlot::factory()->for($event)->create(['archived_at' => now()]);
    $assignment = EventAssignment::factory()->for($active)->create();
    EventAssignment::factory()->for($active)->create(['archived_at' => now()]);
    $this->getJson("/api/v1/events/{$event->id}")->assertOk()->assertJsonCount(1, 'data.slots')->assertJsonPath('data.slots.0.filled_count', 1)->assertJsonCount(1, 'data.slots.0.assignments')->assertJsonPath('data.slots.0.assignments.0.id', $assignment->id);
    expect($event->slots()->count())->toBe(2)->and($active->assignments()->count())->toBe(2);
});

it('protects assignment identities with the person card policy', function (bool $allowed) {
    actingAsUserWith($allowed ? [Permission::PeopleView] : []);
    $event = Event::factory()->create();
    $slot = EventSlot::factory()->for($event)->create();
    $person = Person::factory()->create(['first_name' => 'Анна', 'last_name' => 'Петрова', 'patronymic' => null, 'phone' => '+79123456789', 'note' => 'Секрет']);
    EventAssignment::factory()->for($slot)->create(['person_id' => $person->id]);
    $this->getJson("/api/v1/events/{$event->id}")->assertOk()
        ->assertJsonPath('data.slots.0.assignments.0.person.full_name', $allowed ? 'Петрова Анна' : null)
        ->assertJsonMissingPath('data.slots.0.assignments.0.person.phone')
        ->assertJsonMissingPath('data.slots.0.assignments.0.person.note');
})->with([false, true]);

it('rejects nonexistent event attachments', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $this->postJson('/api/v1/events', churchEvent(['media_ids' => ['01JQZ0000000000000000000ZZ']]))->assertUnprocessable()->assertJsonValidationErrors('media_ids.0');
});

it('unlinks erased accounts from calendar history', function () {
    $user = actingAsUser();
    $event = Event::factory()->create(['created_by_user_id' => $user->id]);
    $template = EventTemplate::factory()->create(['created_by_user_id' => $user->id]);
    $assignment = EventAssignment::factory()->create(['assigned_by_user_id' => $user->id]);
    $this->artisan('people:erase', ['id' => $user->person_id, '--force' => true])->assertSuccessful();
    expect($event->refresh()->created_by_user_id)->toBeNull()->and($template->refresh()->created_by_user_id)->toBeNull()->and($assignment->refresh()->assigned_by_user_id)->toBeNull();
});

it('does not publish EventChanged when only the description changed', function () {
    EventBus::fake([EventChanged::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();

    $this->patchJson("/api/v1/events/{$event->id}", ['description' => 'Принесите Библии'])->assertOk();

    EventBus::assertNotDispatched(EventChanged::class);
});

it('refuses to move a cancelled event but allows editing its description', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->cancelled()->create();

    $this->patchJson("/api/v1/events/{$event->id}", ['starts_at' => '2026-11-09T07:00:00Z', 'ends_at' => '2026-11-09T09:00:00Z'])
        ->assertStatus(422)->assertJsonPath('code', 'event.cancelled');
    $this->patchJson("/api/v1/events/{$event->id}", ['description' => 'Перенесено'])->assertOk();
});

it('shows can_manage false to a plain viewer', function () {
    actingAsUser();
    $event = Event::factory()->create();

    $this->getJson("/api/v1/events/{$event->id}")->assertOk()->assertJsonPath('data.can_manage', false);
});

it('documents conditional notification choices and prohibited update fields', function () {
    $schema = app(Generator::class)();
    $store = $schema['components']['schemas']['StoreEventRequest'];
    expect($store['properties']['notify']['enum'])->toBe(['none', 'ministry', 'all'])
        ->and($store['properties']['media_ids']['type'])->toBe('array')
        ->and($store['oneOf'][0]['properties']['notify']['enum'])->toBe(['none', 'all'])
        ->and($store['oneOf'][1]['properties']['notify']['enum'])->toBe(['none', 'ministry'])
        ->and($store['oneOf'][1]['required'])->toContain('ministry_id');
    $update = $schema['components']['schemas']['UpdateEventRequest'];
    foreach (['owner_type', 'ministry_id', 'slots', 'notify'] as $field) {
        expect($update['properties'][$field])->toBeFalse();
    }
    $resource = $schema['components']['schemas']['EventResource']['properties'];
    expect($resource['starts_at']['type'])->toBe('string')
        ->and($resource['ends_at']['type'])->toBe('string')
        ->and($resource['attachments']['type'])->toBe('array')
        ->and($resource['attachments']['items'])->toBe(['$ref' => '#/components/schemas/MediaResource'])
        ->and($update['properties']['media_ids']['type'])->toBe('array');
    foreach ([$store, $update] as $request) {
        expect($request['properties']['media_ids']['uniqueItems'])->toBeTrue()
            ->and($request['properties']['media_ids']['items']['format'])->toBe('ulid');
    }
});
