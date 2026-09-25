<?php

declare(strict_types=1);

namespace App\Modules\Access\Http\Resources;

use App\Modules\Access\Models\Role;
use App\Modules\Access\Models\RolePermission;
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

        /** @var list<string> $permissions */
        $permissions = $role->relationLoaded('permissions')
            ? $role->permissions->map(fn (RolePermission $permission): string => $permission->permission)->sort()->values()->all()
            : [];

        return [
            'id' => $role->id,
            'scope' => $role->scope->value,
            'ministry_id' => $role->ministry_id,
            'name' => $role->name,
            'description' => $role->description,
            'is_system' => $role->is_system,
            'permissions' => $permissions,
        ];
    }
}
