<?php

declare(strict_types=1);

namespace App\Modules\Access\Http\Resources;

use App\Modules\Access\Models\Role;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Role */
final class RoleResource extends JsonResource
{
    /** @return array{id: string, scope: string, ministry_id: string|null, name: string, description: string|null, is_system: bool, permissions: list<string>} */
    public function toArray(Request $request): array
    {
        $role = $this->resource;
        assert($role instanceof Role);

        return [
            'id' => $role->id,
            'scope' => $role->scope->value,
            'ministry_id' => $role->ministry_id,
            'name' => $role->name,
            'description' => $role->description,
            'is_system' => $role->is_system,
            'permissions' => $role->relationLoaded('permissions')
                ? $role->permissions->pluck('permission')->sort()->values()->all()
                : [],
        ];
    }
}
