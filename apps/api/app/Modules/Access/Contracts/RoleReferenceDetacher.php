<?php

declare(strict_types=1);

namespace App\Modules\Access\Contracts;

use App\Modules\Access\Models\Role;

interface RoleReferenceDetacher
{
    /** Detach only nonblocking references, synchronously in the role deletion transaction. */
    public function handle(Role $role): void;
}
