<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Actions\CancelEvent;
use App\Modules\Calendar\Events\EventCancelled;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Support\DomainRuleException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event as EventBus;

uses(RefreshDatabase::class);

it('denies cancelling to a viewer and a guest', function () {
    $event = Event::factory()->create();
    $this->postJson("/api/v1/events/{$event->id}/cancel")->assertUnauthorized();
    actingAsUser();
    $this->postJson("/api/v1/events/{$event->id}/cancel")->assertForbidden();
});

it('cancels with a trimmed reason while preserving slots assignments and calendar visibility', function () {
    EventBus::fake([EventCancelled::class]);
    $actor = actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    $slot = EventSlot::factory()->for($event)->create();
    $assignment = EventAssignment::factory()->for($slot)->create();
    $this->postJson("/api/v1/events/{$event->id}/cancel", ['reason' => '  Погода  '])
        ->assertOk()->assertJsonPath('data.status', 'cancelled')->assertJsonPath('data.cancel_reason', 'Погода')
        ->assertJsonPath('data.slots.0.id', $slot->id)->assertJsonPath('data.slots.0.can_fill', false)
        ->assertJsonPath('data.slots.0.assignments.0.id', $assignment->id);
    expect($event->refresh()->cancelled_at)->not->toBeNull()
        ->and($event->archived_at)->toBeNull()->and($slot->refresh()->archived_at)->toBeNull()
        ->and($assignment->refresh()->archived_at)->toBeNull();
    $entry = AuditEntry::query()->where('action', 'event.cancelled')->sole();
    expect($entry->actor_user_id)->toBe($actor->id)->and($entry->subject_id)->toBe($event->id)
        ->and($entry->payload)->toBe(['reason' => 'Погода']);
    EventBus::assertDispatchedTimes(EventCancelled::class, 1);
    EventBus::assertDispatched(EventCancelled::class, fn (EventCancelled $e): bool => $e->eventId === $event->id && $e->reason === 'Погода');
    $this->getJson("/api/v1/events/{$event->id}")->assertOk()->assertJsonPath('data.status', 'cancelled');
    $this->getJson('/api/v1/events?from='.$event->starts_at->toDateString().'&to='.$event->ends_at->toDateString())
        ->assertOk()->assertJsonPath('data.0.id', $event->id)->assertJsonPath('data.0.status', 'cancelled');
    $this->postJson("/api/v1/events/{$event->id}/slots", ['label' => 'Новый', 'required_count' => 1])
        ->assertUnprocessable()->assertJsonPath('code', 'event.cancelled');
});

it('rejects repeated cancellation including a stale model without another audit or event', function () {
    $actor = actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    $stale = Event::query()->findOrFail($event->id);
    EventBus::fake([EventCancelled::class]);
    app(CancelEvent::class)->handle($event, null, $actor);
    expect(fn () => app(CancelEvent::class)->handle($stale, 'Иное', $actor))
        ->toThrow(DomainRuleException::class, 'Событие уже отменено.');
    $this->postJson("/api/v1/events/{$event->id}/cancel")->assertUnprocessable()->assertJsonPath('code', 'event.already_cancelled');
    expect(AuditEntry::query()->where('action', 'event.cancelled')->count())->toBe(1);
    EventBus::assertDispatchedTimes(EventCancelled::class, 1);
});

it('uses an explicit null audit actor even when an administrator is authenticated', function () {
    actingAsAdministrator();
    $event = Event::factory()->create();
    app(CancelEvent::class)->handle($event, '  ', null);
    expect($event->refresh()->cancel_reason)->toBeNull()
        ->and(AuditEntry::query()->where('action', 'event.cancelled')->sole()->actor_user_id)->toBeNull();
});

it('lets a ministry manager cancel only their ministry events', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);
    $this->postJson('/api/v1/events/'.Event::factory()->ministry($ministry)->create()->id.'/cancel')->assertOk();
    $this->postJson('/api/v1/events/'.Event::factory()->ministry($other)->create()->id.'/cancel')->assertForbidden();
    $this->postJson('/api/v1/events/'.Event::factory()->create()->id.'/cancel')->assertForbidden();
});

it('validates the optional cancellation reason', function (mixed $reason) {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    $this->postJson("/api/v1/events/{$event->id}/cancel", ['reason' => $reason])->assertUnprocessable()->assertJsonValidationErrors('reason');
    expect($event->refresh()->isCancelled())->toBeFalse();
})->with([[[]], [str_repeat('я', 501)], [123]]);
