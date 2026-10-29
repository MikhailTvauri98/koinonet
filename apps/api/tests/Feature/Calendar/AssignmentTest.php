<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Actions\AssignPerson;
use App\Modules\Calendar\Actions\RemoveAssignment;
use App\Modules\Calendar\Events\AssignmentCreated;
use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use App\Support\DomainRuleException;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event as EventBus;

uses(RefreshDatabase::class);

function assignerIn(Ministry $ministry): User
{
    $role = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Координатор']);
    $role->permissions()->create(['permission' => Permission::SlotsAssign->value]);
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$role->id]);

    return $user;
}

it('denies filling a slot without any right', function () {
    actingAsUser();
    $slot = EventSlot::factory()->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => Person::factory()->create()->id])->assertForbidden();
});

it('lets the event manager fill any slot', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $person = Person::factory()->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id])
        ->assertCreated()
        ->assertJsonPath('data.person.id', $person->id)
        ->assertJsonPath('warnings', []);
});

it('lets slots.assign fill a slot with their ministry role in a church event', function () {
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    $slot = EventSlot::factory()->withRole($vocalist)->create();
    assignerIn($ministry);
    $singer = Person::factory()->create();
    memberOf($ministry, $singer, [$vocalist->id]);

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $singer->id])->assertCreated();
});

it('does not let slots.assign fill a free slot or a slot of another ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $event = Event::factory()->create();
    $free = EventSlot::factory()->for($event)->create();
    $foreign = EventSlot::factory()->for($event)->withRole(Role::query()->find($other->default_role_id))->create();
    assignerIn($ministry);
    $person = Person::factory()->create();

    $this->postJson("/api/v1/slots/{$free->id}/assignments", ['person_id' => $person->id])->assertForbidden();
    $this->postJson("/api/v1/slots/{$foreign->id}/assignments", ['person_id' => $person->id])->assertForbidden();
});

it('warns about a role mismatch without blocking', function () {
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->withRole($vocalist)->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => Person::factory()->create()->id])
        ->assertCreated()
        ->assertJsonPath('warnings.0.code', 'role_mismatch');
});

it('warns about a time conflict with the overlapping event ids', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $person = Person::factory()->create();
    $busy = Event::factory()->between(CarbonImmutable::parse('2026-11-08 10:00'), CarbonImmutable::parse('2026-11-08 12:00'))->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($busy)->create())->for($person)->create();
    $target = Event::factory()->between(CarbonImmutable::parse('2026-11-08 11:00'), CarbonImmutable::parse('2026-11-08 13:00'))->create();
    $slot = EventSlot::factory()->for($target)->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id])
        ->assertCreated()
        ->assertJsonPath('warnings.0.code', 'time_conflict')
        ->assertJsonPath('warnings.0.event_ids', [$busy->id]);
});

it('warns about over capacity and still assigns', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create(['required_count' => 1]);
    EventAssignment::factory()->for($slot)->for(Person::factory()->create())->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => Person::factory()->create()->id])
        ->assertCreated()
        ->assertJsonPath('warnings.0.code', 'over_capacity');

    expect($slot->assignments()->count())->toBe(2);
});

it('refuses the same person twice in one slot', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $person = Person::factory()->create();
    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id]);

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id])
        ->assertStatus(422)->assertJsonPath('code', 'assignment.duplicate');
});

it('refuses an archived person and a cancelled event', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => Person::factory()->archived()->create()->id])
        ->assertStatus(422)->assertJsonPath('code', 'assignment.person_archived');

    $cancelledSlot = EventSlot::factory()->for(Event::factory()->cancelled()->create())->create();
    $this->postJson("/api/v1/slots/{$cancelledSlot->id}/assignments", ['person_id' => Person::factory()->create()->id])
        ->assertStatus(422)->assertJsonPath('code', 'event.cancelled');
});

it('publishes AssignmentCreated with the account id when the person has one', function () {
    EventBus::fake([AssignmentCreated::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $person = Person::factory()->has(User::factory())->create();

    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id]);

    EventBus::assertDispatched(AssignmentCreated::class, fn (AssignmentCreated $e) => $e->personId === $person->id && $e->userId === $person->user->id);
});

it('removes an assignment and publishes AssignmentRemoved', function () {
    EventBus::fake([AssignmentRemoved::class]);
    actingAsUserWith([Permission::CalendarChurchManage]);
    $assignment = EventAssignment::factory()->for(EventSlot::factory()->create())->for(Person::factory()->create())->create();

    $this->deleteJson("/api/v1/assignments/{$assignment->id}")->assertNoContent();

    expect($assignment->refresh()->archived_at)->not->toBeNull();
    EventBus::assertDispatched(AssignmentRemoved::class);
});

it('reports can_fill per slot in the event card', function () {
    $ministry = ministryWithRoles();
    $vocalist = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Вокалист']);
    $event = Event::factory()->create();
    EventSlot::factory()->for($event)->withRole($vocalist)->create(['sort_order' => 0]);
    EventSlot::factory()->for($event)->create(['sort_order' => 1]);
    assignerIn($ministry);

    $this->getJson("/api/v1/events/{$event->id}")
        ->assertJsonPath('data.slots.0.can_fill', true)
        ->assertJsonPath('data.slots.1.can_fill', false);
});

it('archives removal preserves payload and permits assigning again', function () {
    EventBus::fake([AssignmentCreated::class, AssignmentRemoved::class]);
    $actor = actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $account = User::factory()->create();
    $id = $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $account->person_id])->assertCreated()->json('data.id');
    $this->deleteJson("/api/v1/assignments/{$id}")->assertNoContent();
    $this->deleteJson("/api/v1/assignments/{$id}")->assertNotFound();
    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $account->person_id])->assertCreated()->assertJsonPath('warnings', []);
    expect($slot->assignments()->count())->toBe(2)->and($slot->assignments()->whereNull('archived_at')->count())->toBe(1);
    EventBus::assertDispatched(AssignmentCreated::class, fn ($e) => $e->eventId === $slot->event_id && $e->slotId === $slot->id && $e->personId === $account->person_id && $e->userId === $account->id && $e->actorUserId === $actor->id);
    EventBus::assertDispatchedTimes(AssignmentRemoved::class, 1);
    EventBus::assertDispatched(AssignmentRemoved::class, fn ($e) => $e->eventId === $slot->event_id && $e->slotId === $slot->id && $e->personId === $account->person_id && $e->userId === $account->id && $e->actorUserId === $actor->id);
});

it('denies removal without slot filling permission and freezes cancelled assignments', function () {
    $assignment = EventAssignment::factory()->create();
    actingAsUser();
    $this->deleteJson("/api/v1/assignments/{$assignment->id}")->assertForbidden();
    app('auth')->forgetGuards();
    actingAsUserWith([Permission::CalendarChurchManage]);
    $assignment->slot->event->update(['status' => 'cancelled', 'cancelled_at' => now()]);
    $this->deleteJson("/api/v1/assignments/{$assignment->id}")->assertUnprocessable()->assertJsonPath('code', 'event.cancelled');
    $this->getJson("/api/v1/events/{$assignment->slot->event_id}")->assertOk()->assertJsonPath('data.slots.0.can_fill', false);
    expect($assignment->refresh()->archived_at)->toBeNull();
});

it('reloads current state in assignment actions', function (string $change) {
    $actor = actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $person = Person::factory()->create();
    $assignment = EventAssignment::factory()->for($slot)->for($person)->create();
    $slot->load('event');
    $assignment->load('slot.event');
    if ($change === 'cancelled') {
        Event::query()->whereKey($slot->event_id)->update(['status' => 'cancelled', 'cancelled_at' => now()]);
        expect(fn () => app(AssignPerson::class)->handle($actor, $slot, Person::factory()->create()))->toThrow(DomainRuleException::class);
        expect(fn () => app(RemoveAssignment::class)->handle($assignment))->toThrow(DomainRuleException::class);
    } else {
        $slot->update(['archived_at' => now()]);
        expect(fn () => app(AssignPerson::class)->handle($actor, $slot, $person))->toThrow(ModelNotFoundException::class);
        expect(fn () => app(RemoveAssignment::class)->handle($assignment))->toThrow(ModelNotFoundException::class);
    }
})->with(['cancelled', 'archived_slot']);

it('warns about hidden conflicts without exposing event identifiers', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $person = Person::factory()->create();
    $hidden = Event::factory()->ministry(ministryWithRoles('Закрытое'))->create(['visibility' => 'assigned']);
    EventAssignment::factory()->for(EventSlot::factory()->for($hidden)->create())->for($person)->create();
    $slot = EventSlot::factory()->for(Event::factory()->create(['starts_at' => $hidden->starts_at, 'ends_at' => $hidden->ends_at]))->create();
    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => $person->id])->assertCreated()
        ->assertJsonPath('warnings.0.code', 'time_conflict')->assertJsonPath('warnings.0.event_ids', []);
});

it('validates person identifiers and redacts assignment identity without people view', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $slot = EventSlot::factory()->create();
    $this->postJson("/api/v1/slots/{$slot->id}/assignments", [])->assertUnprocessable()->assertJsonValidationErrors('person_id');
    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => 'bad'])->assertUnprocessable()->assertJsonValidationErrors('person_id');
    $this->postJson("/api/v1/slots/{$slot->id}/assignments", ['person_id' => Person::factory()->create()->id])->assertCreated()->assertJsonPath('data.person.full_name', null)->assertJsonPath('data.person.photo_thumb_url', null);
});
