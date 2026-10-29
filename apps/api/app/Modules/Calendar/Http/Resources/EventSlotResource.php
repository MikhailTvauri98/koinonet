<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Resources;

use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\ResourceType;
use App\Modules\Directory\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin EventSlot */
final class EventSlotResource extends JsonResource
{
    /** @return array{id: string, label: string, resource_type: ResourceType, role: array{id: string, name: string, ministry_id: string|null}|null, required_count: int, filled_count: int, sort_order: int, can_fill: bool, assignments: AnonymousResourceCollection} */
    public function toArray(Request $request): array
    {
        $slot = $this->resource;
        assert($slot instanceof EventSlot);
        $role = $slot->role;
        $assignments = $slot->assignments->whereNull('archived_at')->values();
        $viewer = $request->user();
        assert($viewer instanceof User);

        return [
            'id' => $slot->id,
            'label' => $slot->label,
            'resource_type' => $slot->resource_type,
            'role' => $role === null ? null : ['id' => $role->id, 'name' => $role->name, 'ministry_id' => $role->ministry_id],
            'required_count' => $slot->required_count,
            'filled_count' => $assignments->count(),
            'sort_order' => $slot->sort_order,
            'can_fill' => Gate::forUser($viewer)->allows('fill', $slot),
            'assignments' => EventAssignmentResource::collection($assignments),
        ];
    }
}
