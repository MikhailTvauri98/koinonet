<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;

final class RemoveSlot
{
    public function handle(EventSlot $slot): void
    {
        $actorUserId = Auth::id();
        DB::transaction(function () use ($slot, $actorUserId): void {
            $event = Event::query()->lockForUpdate()->findOrFail($slot->event_id);
            $slot = EventSlot::query()->whereNull('archived_at')->lockForUpdate()->findOrFail($slot->id);
            if ($event->isCancelled()) {
                throw DomainRuleException::because('event.cancelled', 'Слоты отменённого события изменить нельзя.');
            }
            $assignments = $slot->assignments()->whereNull('archived_at')->with('person.user')->lockForUpdate()->get();
            $removed = $assignments->map(fn ($assignment): AssignmentRemoved => new AssignmentRemoved(
                $event->id, $slot->id, (string) $assignment->person_id, $assignment->person?->user?->id, $actorUserId,
            ));
            $archivedAt = now();
            $slot->assignments()->whereNull('archived_at')->update(['archived_at' => $archivedAt]);
            $slot->update(['archived_at' => $archivedAt]);
            foreach ($removed as $removal) {
                event($removal);
            }
        });
    }
}
