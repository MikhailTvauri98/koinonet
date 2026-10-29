<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Actions\AddSlot;
use App\Modules\Calendar\Actions\RemoveSlot;
use App\Modules\Calendar\Actions\UpdateSlot;
use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event as EventBus;

uses(RefreshDatabase::class);

it('documents capacity as required only for slot creation', function () {
    $schema = app(Generator::class)();
    $post = $schema['paths']['/events/{event}/slots']['post']['requestBody']['content']['application/json']['schema']['$ref'];
    $patch = $schema['paths']['/slots/{slot}']['patch']['requestBody']['content']['application/json']['schema']['$ref'];
    $postSchema = $schema['components']['schemas'][basename($post)];
    $patchSchema = $schema['components']['schemas'][basename($patch)];
    expect($postSchema['required'])->toContain('required_count')
        ->and($patchSchema['required'] ?? [])->not->toContain('required_count');
});

it('normalizes direct action labels and falls back to the role for blank input', function () {
    $ministry = ministryWithRoles();
    $event = Event::factory()->create();
    $slot = app(AddSlot::class)->handle($event, ['label' => '  Помощник  ', 'required_count' => 1]);
    expect($slot->label)->toBe('Помощник');
    $slot = app(UpdateSlot::class)->handle($slot, ['label' => '  ', 'role_id' => $ministry->default_role_id]);
    expect($slot->label)->toBe('Участник');
});

it('denies slot management without event management permission', function () {
    actingAsUser();
    $slot = EventSlot::factory()->create();
    $this->postJson("/api/v1/events/{$slot->event_id}/slots", ['label' => 'Помощник', 'required_count' => 1])->assertForbidden();
    $this->patchJson("/api/v1/slots/{$slot->id}", ['label' => 'Другой'])->assertForbidden();
    $this->deleteJson("/api/v1/slots/{$slot->id}")->assertForbidden();
});

it('adds ordered slots with church management permission and returns live counts', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    EventSlot::factory()->for($event)->create(['sort_order' => 3]);
    $this->postJson("/api/v1/events/{$event->id}/slots", ['label' => 'Помощник', 'required_count' => 2])
        ->assertCreated()->assertJsonPath('data.label', 'Помощник')->assertJsonPath('data.filled_count', 0)->assertJsonPath('data.sort_order', 4);
});

it('lets a ministry leader manage only slots of their ministry event', function () {
    $mine = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    memberOf($mine, $user->person, [$mine->roles()->where('name', 'Лидер')->sole()->id]);
    $event = Event::factory()->ministry($mine)->create();
    $foreign = EventSlot::factory()->for(Event::factory()->ministry($other))->create();
    $id = $this->postJson("/api/v1/events/{$event->id}/slots", ['role_id' => $other->default_role_id, 'required_count' => 1])
        ->assertCreated()->assertJsonPath('data.role.ministry_id', $other->id)->json('data.id');
    $this->patchJson("/api/v1/slots/{$id}", ['label' => 'Звук'])->assertOk();
    $this->deleteJson("/api/v1/slots/{$id}")->assertNoContent();
    $this->postJson("/api/v1/events/{$foreign->event_id}/slots", ['label' => 'Звук', 'required_count' => 1])->assertForbidden();
    $this->patchJson("/api/v1/slots/{$foreign->id}", ['label' => 'Звук'])->assertForbidden();
    $this->deleteJson("/api/v1/slots/{$foreign->id}")->assertForbidden();
});

it('derives a role label and supports partial updates and removing the role', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $ministry = ministryWithRoles();
    $event = Event::factory()->create();
    $id = $this->postJson("/api/v1/events/{$event->id}/slots", ['role_id' => $ministry->default_role_id, 'required_count' => 2])
        ->assertCreated()->assertJsonPath('data.label', 'Участник')->json('data.id');
    $this->patchJson("/api/v1/slots/{$id}", ['label' => 'Старший помощник'])->assertOk()
        ->assertJsonPath('data.label', 'Старший помощник')->assertJsonPath('data.required_count', 2)->assertJsonPath('data.role.id', $ministry->default_role_id);
    $this->patchJson("/api/v1/slots/{$id}", ['required_count' => 3])->assertOk()->assertJsonPath('data.label', 'Старший помощник');
    $this->patchJson("/api/v1/slots/{$id}", ['label' => null])->assertOk()->assertJsonPath('data.label', 'Участник');
    $this->patchJson("/api/v1/slots/{$id}", ['role_id' => null])->assertOk()->assertJsonPath('data.role', null)->assertJsonPath('data.label', 'Участник');
});

it('rejects missing free labels and global or archived ministry roles on create and update', function (string $case, string $code) {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $attributes = ['label' => null];
    if ($case === 'global') {
        $attributes['role_id'] = Role::factory()->global()->create()->id;
    } elseif ($case === 'archived') {
        $ministry = ministryWithRoles();
        $ministry->update(['archived_at' => now()]);
        $attributes['role_id'] = $ministry->default_role_id;
    }
    $this->postJson("/api/v1/events/{$slot->event_id}/slots", $attributes + ['required_count' => 1])->assertUnprocessable()->assertJsonPath('code', $code);
    $this->patchJson("/api/v1/slots/{$slot->id}", $attributes)->assertUnprocessable()->assertJsonPath('code', $code);
})->with([
    ['free', 'slot.label_required'], ['global', 'slot.role_not_ministry'], ['archived', 'slot.role_archived_ministry'],
]);

it('validates capacity bounds labels and role identifiers', function (array $attributes, string $field) {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $this->postJson("/api/v1/events/{$slot->event_id}/slots", $attributes + ['label' => 'Х', 'required_count' => 1])->assertUnprocessable()->assertJsonValidationErrors($field);
    $this->patchJson("/api/v1/slots/{$slot->id}", $attributes)->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    [['required_count' => 0], 'required_count'], [['required_count' => 51], 'required_count'],
    [['label' => str_repeat('a', 101)], 'label'], [['role_id' => 'bad'], 'role_id'],
]);

it('requires capacity on creation but accepts both boundary capacities', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    $this->postJson("/api/v1/events/{$event->id}/slots", ['label' => 'Х'])->assertUnprocessable()->assertJsonValidationErrors('required_count');
    foreach ([1, 50] as $capacity) {
        $this->postJson("/api/v1/events/{$event->id}/slots", ['label' => 'Х', 'required_count' => $capacity])->assertCreated()->assertJsonPath('data.required_count', $capacity);
    }
});

it('ignores unwritable columns on partial updates including direct action calls', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $other = Event::factory()->create();
    $this->patchJson("/api/v1/slots/{$slot->id}", ['label' => 'Х', 'event_id' => $other->id, 'sort_order' => 99, 'archived_at' => now()->toISOString()])->assertOk()->assertJsonPath('data.sort_order', 0);
    app(UpdateSlot::class)->handle($slot, ['label' => 'Y', 'event_id' => $other->id, 'sort_order' => 99, 'archived_at' => now()]);
    expect($slot->refresh()->event_id)->not->toBe($other->id)->and($slot->sort_order)->toBe(0)->and($slot->archived_at)->toBeNull();
});

it('freezes every slot endpoint on a cancelled event', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->for(Event::factory()->cancelled())->create();
    $this->postJson("/api/v1/events/{$slot->event_id}/slots", ['label' => 'Х', 'required_count' => 1])->assertUnprocessable()->assertJsonPath('code', 'event.cancelled');
    $this->patchJson("/api/v1/slots/{$slot->id}", ['label' => 'Х'])->assertUnprocessable()->assertJsonPath('code', 'event.cancelled');
    $this->deleteJson("/api/v1/slots/{$slot->id}")->assertUnprocessable()->assertJsonPath('code', 'event.cancelled');
    expect($slot->refresh()->label)->toBe('Помощник')->and($slot->archived_at)->toBeNull();
});

it('reloads current event state for direct slot actions instead of trusting stale models', function (string $action) {
    $slot = EventSlot::factory()->create();
    $event = $slot->event;
    Event::query()->whereKey($event->id)->update(['status' => 'cancelled', 'cancelled_at' => now()]);
    $run = fn () => match ($action) {
        'add' => app(AddSlot::class)->handle($event, ['label' => 'Х', 'required_count' => 1]),
        'update' => app(UpdateSlot::class)->handle($slot, ['label' => 'Х']),
        'remove' => app(RemoveSlot::class)->handle($slot),
    };
    expect($run)->toThrow(DomainRuleException::class, 'отменённого события');
})->with(['add', 'update', 'remove']);

it('archives a slot and only active assignments with stable removal payloads', function () {
    EventBus::fake([AssignmentRemoved::class]);
    $actor = actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $account = User::factory()->create();
    $first = EventAssignment::factory()->for($slot)->create(['person_id' => $account->person_id]);
    $second = EventAssignment::factory()->for($slot)->create();
    $old = EventAssignment::factory()->for($slot)->create(['archived_at' => now()->subDay()]);
    $oldTime = $old->archived_at->toISOString();
    $this->deleteJson("/api/v1/slots/{$slot->id}")->assertNoContent();
    expect($slot->refresh()->archived_at)->not->toBeNull()
        ->and($first->refresh()->archived_at)->not->toBeNull()->and($second->refresh()->archived_at)->not->toBeNull()
        ->and($old->refresh()->archived_at->toISOString())->toBe($oldTime)->and($slot->assignments()->count())->toBe(3);
    EventBus::assertDispatchedTimes(AssignmentRemoved::class, 2);
    foreach ([[$first, $account->id], [$second, null]] as [$assignment, $userId]) {
        EventBus::assertDispatched(AssignmentRemoved::class, fn (AssignmentRemoved $e) => $e->eventId === $slot->event_id && $e->slotId === $slot->id && $e->personId === $assignment->person_id && $e->userId === $userId && $e->actorUserId === $actor->id);
    }
    $this->getJson("/api/v1/events/{$slot->event_id}")->assertOk()->assertJsonCount(0, 'data.slots');
    $this->patchJson("/api/v1/slots/{$slot->id}", ['label' => 'Х'])->assertNotFound();
    $this->deleteJson("/api/v1/slots/{$slot->id}")->assertNotFound();
    EventBus::assertDispatchedTimes(AssignmentRemoved::class, 2);
});
