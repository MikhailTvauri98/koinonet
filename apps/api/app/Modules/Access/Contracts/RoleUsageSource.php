<?php

declare(strict_types=1);

namespace App\Modules\Access\Contracts;

use App\Modules\Access\Models\Role;

interface RoleUsageSource
{
    /** @return list<array{type: string, id: string, title: string}> */
    public function blockersFor(Role $role): array;
}
