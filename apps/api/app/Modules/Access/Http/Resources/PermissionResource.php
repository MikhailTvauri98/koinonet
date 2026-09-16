<?php

declare(strict_types=1);

namespace App\Modules\Access\Http\Resources;

use App\Modules\Access\Permission;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Permission */
final class PermissionResource extends JsonResource
{
    /** @return array{key: string, scope: string, label: string, description: string} */
    public function toArray(Request $request): array
    {
        $permission = $this->resource;
        assert($permission instanceof Permission);

        return [
            'key' => $permission->value,
            'scope' => $permission->scope()->value,
            'label' => $permission->label(),
            'description' => $permission->description(),
        ];
    }
}
