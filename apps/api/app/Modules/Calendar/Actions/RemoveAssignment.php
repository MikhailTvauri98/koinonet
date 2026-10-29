<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final class RemoveAssignment
{
    public function handle(EventAssignment $assignment): void
    {
        DB::transaction(function () use ($assignment): void {
            $slotId = $assignment->slot_id;
            $eventId = EventSlot::query()->whereKey($slotId)->value('event_id');
            $event = Event::query()->whereNull('archived_at')->lockForUpdate()->findOrFail($eventId);
            $slot = EventSlot::query()->whereNull('archived_at')->lockForUpdate()->findOrFail($slotId);
            $assignment = EventAssignment::query()->whereNull('archived_at')->lockForUpdate()->findOrFail($assignment->id);
            $slot->setRelation('event', $event);
            $assignment->setRelation('slot', $slot);
            $actor = Auth::user();
            if ($actor instanceof User) {
                Gate::forUser($actor)->authorize('delete', $assignment);
            }
            if ($event->isCancelled()) {
                throw DomainRuleException::because('event.cancelled', 'Назначения отменённого события изменить нельзя.');
            }
            $removed = new AssignmentRemoved($event->id, $slot->id, (string) $assignment->person_id, $assignment->person?->user?->id, $actor?->getAuthIdentifier());
            $assignment->update(['archived_at' => now()]);
            event($removed);
        });
    }
}
