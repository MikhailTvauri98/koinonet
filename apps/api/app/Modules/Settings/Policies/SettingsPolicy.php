<?php

declare(strict_types=1);

namespace App\Modules\Settings\Policies;

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Models\User;

final readonly class SettingsPolicy
{
    public function __construct(private PermissionResolver $permissions) {}

    public function update(User $user): bool
    {
        return $this->permissions->can($user, Permission::SettingsManage);
    }
}
