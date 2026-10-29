<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Resources;

use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\Event;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin Event */
final class EventResource extends JsonResource
{
    /**
     * @return array{
     * id: string, owner_type: EventOwnerType, ministry: array{id: string, name: string}|null,
     * template_id: string|null, occurrence_date: string|null, title: string, description: string|null,
     * location: string|null, starts_at: string, ends_at: string, visibility: EventVisibility, status: EventStatus,
     * cancelled_at: string|null, cancel_reason: string|null, can_manage: bool, slots: AnonymousResourceCollection
     * }
     */
    public function toArray(Request $request): array
    {
        $event = $this->resource;
        assert($event instanceof Event);
        $event->loadMissing([
            'ministry',
            'slots' => fn ($query) => $query->whereNull('archived_at'),
            'slots.role',
            'slots.assignments' => fn ($query) => $query->whereNull('archived_at')->orderBy('created_at')->orderBy('id'),
            'slots.assignments.person.photo',
        ]);
        foreach ($event->slots as $slot) {
            $slot->setRelation('event', $event);
        }
        $ministry = $event->ministry;

        return [
            'id' => $event->id,
            'owner_type' => $event->owner_type,
            'ministry' => $ministry === null ? null : ['id' => $ministry->id, 'name' => $ministry->name],
            'template_id' => $event->template_id,
            /** @format date */
            'occurrence_date' => $event->occurrence_date?->toDateString(),
            'title' => $event->title,
            'description' => $event->description,
            'location' => $event->location,
            /** @format date-time */
            'starts_at' => (string) $event->starts_at->toISOString(),
            /** @format date-time */
            'ends_at' => (string) $event->ends_at->toISOString(),
            'visibility' => $event->visibility,
            'status' => $event->status,
            /** @format date-time */
            'cancelled_at' => $event->cancelled_at?->toISOString(),
            'cancel_reason' => $event->cancel_reason,
            'can_manage' => Gate::allows('update', $event),
            'slots' => EventSlotResource::collection($event->slots->whereNull('archived_at')->values()),
        ];
    }
}
