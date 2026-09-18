<?php

declare(strict_types=1);

namespace App\Modules\Access;

use App\Modules\Access\Models\PersonRole;
use App\Modules\Access\Models\Role;

final class RoleUsageCollector
{
    /** @return array{carriers: int, blockers: list<array{type: string, id: string, title: string}>} */
    public function for(Role $role): array
    {
        return [
            'carriers' => PersonRole::query()->where('role_id', $role->id)->count(),
            'blockers' => [],
        ];
    }
}
