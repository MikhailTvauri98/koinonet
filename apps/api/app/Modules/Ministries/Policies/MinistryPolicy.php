<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Policies;

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;

final readonly class MinistryPolicy
{
    public function __construct(private PermissionResolver $permissions) {}

    /** Every account sees the list; without the right to see all it holds only their own ministries. */
    public function viewAny(User $user): bool
    {
        return ! $user->isDisabled();
    }

    public function viewAll(User $user): bool
    {
        return $this->permissions->can($user, Permission::MinistriesViewAll)
            || $this->permissions->can($user, Permission::MinistriesManageAll);
    }

    public function view(User $user, Ministry $ministry): bool
    {
        return $this->viewAll($user) || $this->isMember($user, $ministry);
    }

    public function create(User $user): bool
    {
        return $this->permissions->can($user, Permission::MinistriesCreate);
    }

    public function update(User $user, Ministry $ministry): bool
    {
        return $this->permissions->canInMinistry($user, Permission::MinistryEdit, $ministry->id);
    }

    // docs/architecture.md 6.1 закрепляет выбор роли по умолчанию за
    // roles.manage, а не ministry.edit — отдельная способность вместо
    // переиспользования update(), потому что PATCH
    // /ministries/{id} принимает default_role_id вперемешку с name/description
    // в одном запросе (MinistryController::update проверяет обе способности
    // независимо, по тому, какие поля реально пришли).
    public function changeDefaultRole(User $user, Ministry $ministry): bool
    {
        return $this->permissions->canInMinistry($user, Permission::RolesManage, $ministry->id);
    }

    public function archive(User $user, Ministry $ministry): bool
    {
        return $this->permissions->can($user, Permission::MinistriesCreate);
    }

    public function manageMembers(User $user, Ministry $ministry): bool
    {
        return $this->permissions->canInMinistry($user, Permission::MembersManage, $ministry->id);
    }

    private function isMember(User $user, Ministry $ministry): bool
    {
        return ! $user->isDisabled()
            && $ministry->members()->where('person_id', $user->person_id)->exists();
    }
}
