<?php

declare(strict_types=1);

namespace App\Modules\Access\Policies;

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Models\User;

final readonly class AuditPolicy
{
    public function __construct(private PermissionResolver $permissions) {}

    public function viewAny(User $user): bool
    {
        return $this->permissions->can($user, Permission::AuditView);
    }
}
