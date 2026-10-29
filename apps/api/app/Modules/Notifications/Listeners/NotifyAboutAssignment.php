<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Listeners;

use App\Modules\Calendar\Events\AssignmentCreated;
use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Notifications\AssignmentCreatedNotification;
use App\Modules\Notifications\Notifications\AssignmentRemovedNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

final class NotifyAboutAssignment implements ShouldQueue
{
    public function handle(AssignmentCreated|AssignmentRemoved $event): void
    {
        if ($event->userId === null || $event->userId === $event->actorUserId) {
            return;
        }
        $user = User::query()->whereNull('disabled_at')->where('person_id', $event->personId)
            ->whereHas('person', fn ($query) => $query->whereNull('archived_at'))->find($event->userId);
        // Removal preserves the slot label even when archiving the slot caused it.
        $slot = EventSlot::query()->with('event')->where('event_id', $event->eventId)->find($event->slotId);
        if ($user === null || $slot === null || $slot->event->archived_at !== null) {
            return;
        }
        if ($event instanceof AssignmentCreated && ($slot->archived_at !== null
            || ! EventAssignment::query()->where('slot_id', $slot->id)->where('person_id', $event->personId)->whereNull('archived_at')->exists())) {
            return;
        }
        Notification::send($user, $event instanceof AssignmentCreated
            ? new AssignmentCreatedNotification($slot->event, $slot->label)
            : new AssignmentRemovedNotification($slot->event, $slot->label));
    }
}
