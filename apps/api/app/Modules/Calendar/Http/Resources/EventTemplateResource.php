<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Resources;

use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\EventTemplate;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin EventTemplate */
final class EventTemplateResource extends JsonResource
{
    /** @return array{id: string, owner_type: EventOwnerType, ministry: array{id: string, name: string}|null, title: string, description: string|null, location: string|null, visibility: EventVisibility, start_time: string, duration_minutes: int, recurrence: array{type: string, weekday: int, nth?: int, anchor_date?: string}|null, active: bool, generated_until: string|null, archived: bool, can_manage: bool, slots: AnonymousResourceCollection} */
    public function toArray(Request $request): array
    {
        $template = $this->resource;
        assert($template instanceof EventTemplate);
        $template->loadMissing(['ministry', 'slots' => fn ($query) => $query->whereNull('archived_at'), 'slots.role']);
        $ministry = $template->ministry;

        return [
            'id' => $template->id,
            'owner_type' => $template->owner_type,
            'ministry' => $ministry === null ? null : ['id' => $ministry->id, 'name' => $ministry->name],
            'title' => $template->title,
            'description' => $template->description,
            'location' => $template->location,
            'visibility' => $template->visibility,
            /** @format time */
            'start_time' => substr($template->start_time, 0, 5),
            'duration_minutes' => $template->duration_minutes,
            'recurrence' => $template->recurrence,
            'active' => $template->active,
            /** @format date */
            'generated_until' => $template->generated_until?->toDateString(),
            'archived' => $template->archived_at !== null,
            'can_manage' => Gate::allows('update', $template),
            'slots' => EventTemplateSlotResource::collection($template->slots->whereNull('archived_at')->values()),
        ];
    }
}
