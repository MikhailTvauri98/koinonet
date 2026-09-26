<?php

declare(strict_types=1);

namespace App\Modules\Access\Policies;

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Access\RoleScope;
use App\Modules\Directory\Models\User;

final readonly class RolePolicy
{
    public function __construct(private PermissionResolver $permissions) {}

    public function viewAny(User $user, RoleScope $scope, ?string $ministryId = null): bool
    {
        if ($this->canManage($user, $scope, $ministryId)) {
            return true;
        }

        // Granting/revoking a ministry role is `members.manage` territory
        // (architecture 6.1: "Добавлять и исключать участников, выдавать и
        // снимать роли служения"), but granting one first requires seeing the
        // ministry's role catalogue.
        // `roles.manage` (create/edit/delete the roles themselves, pick the
        // default one) stays strictly stronger and is not widened here -
        // create/update/delete/viewUsage above still call `canManage` alone.
        return $scope === RoleScope::Ministry
            && $ministryId !== null
            && $this->permissions->canInMinistry($user, Permission::MembersManage, $ministryId);
    }

    public function create(User $user, RoleScope $scope, ?string $ministryId = null): bool
    {
        return $this->canManage($user, $scope, $ministryId);
    }

    public function update(User $user, Role $role): bool
    {
        return $this->canManage($user, $role->scope, $role->ministry_id);
    }

    public function delete(User $user, Role $role): bool
    {
        return $this->canManage($user, $role->scope, $role->ministry_id);
    }

    public function viewUsage(User $user, Role $role): bool
    {
        return $this->canManage($user, $role->scope, $role->ministry_id);
    }

    public function assignGlobalRoles(User $user): bool
    {
        return $this->permissions->can($user, Permission::RolesManageGlobal);
    }

    private function canManage(User $user, RoleScope $scope, ?string $ministryId): bool
    {
        if ($scope === RoleScope::Global) {
            return $this->permissions->can($user, Permission::RolesManageGlobal);
        }

        return $ministryId !== null
            && $this->permissions->canInMinistry($user, Permission::RolesManage, $ministryId);
    }
}
