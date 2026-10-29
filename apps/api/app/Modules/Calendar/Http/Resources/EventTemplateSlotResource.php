<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Resources;

use App\Modules\Calendar\Models\EventTemplateSlot;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin EventTemplateSlot */
final class EventTemplateSlotResource extends JsonResource
{
    /** @return array{id: string, label: string, role: array{id: string, name: string, ministry_id: string|null}|null, required_count: int, sort_order: int} */
    public function toArray(Request $request): array
    {
        $slot = $this->resource;
        assert($slot instanceof EventTemplateSlot);
        $role = $slot->role;

        return [
            'id' => $slot->id,
            'label' => $slot->label,
            'role' => $role === null ? null : ['id' => $role->id, 'name' => $role->name, 'ministry_id' => $role->ministry_id],
            'required_count' => $slot->required_count,
            'sort_order' => $slot->sort_order,
        ];
    }
}
