<?php

declare(strict_types=1);

namespace App\Modules\Directory\Policies;

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;

final readonly class PersonPolicy
{
    public function __construct(private PermissionResolver $permissions) {}

    public function view(User $user, Person $person): bool
    {
        return $this->permissions->can($user, Permission::PeopleView);
    }

    public function create(User $user): bool
    {
        return $this->permissions->can($user, Permission::PeopleManage);
    }

    public function update(User $user, Person $person): bool
    {
        return $this->permissions->can($user, Permission::PeopleManage);
    }

    public function archive(User $user, Person $person): bool
    {
        return $this->permissions->can($user, Permission::PeopleManage);
    }

    public function restore(User $user, Person $person): bool
    {
        return $this->permissions->can($user, Permission::PeopleManage);
    }
}
