<?php

declare(strict_types=1);

namespace App\Modules\Access;

use App\Modules\Access\Contracts\MinistryPermissionSource;
use App\Modules\Access\Models\PersonRole;
use App\Modules\Access\Models\Role;
use App\Modules\Directory\Models\User;
use Illuminate\Support\Facades\Cache;

final readonly class PermissionResolver
{
    public function __construct(
        private PermissionCache $cache,
        private MinistryPermissionSource $ministries,
    ) {}

    public function for(User $user): UserPermissions
    {
        if ($user->isDisabled()) {
            return new UserPermissions(false, [], []);
        }

        /** @var array{administrator: bool, global: list<string>, ministries: array<string, list<string>>} $resolved */
        $resolved = Cache::remember($this->cache->key($user->id), 3600, function () use ($user): array {
            $roles = Role::query()
                ->whereIn(
                    'id',
                    PersonRole::query()->where('person_id', $user->person_id)->select('role_id'),
                )
                ->with('permissions')
                ->get();

            if ($roles->contains('is_system', true)) {
                return [
                    'administrator' => true,
                    'global' => array_map(
                        fn (Permission $permission): string => $permission->value,
                        Permission::ofScope(PermissionScope::Global),
                    ),
                    'ministries' => $this->ministries->forPerson($user->person_id),
                ];
            }

            /** @var list<string> $global */
            $global = $roles
                ->flatMap(fn (Role $role) => $role->permissions->pluck('permission'))
                ->unique()
                ->values()
                ->all();

            return [
                'administrator' => false,
                'global' => $global,
                'ministries' => $this->ministries->forPerson($user->person_id),
            ];
        });

        return new UserPermissions(
            $resolved['administrator'],
            $resolved['global'],
            $resolved['ministries'],
        );
    }

    public function can(User $user, Permission $permission): bool
    {
        $resolved = $this->for($user);

        return $resolved->administrator || in_array($permission->value, $resolved->global, true);
    }

    public function canInMinistry(User $user, Permission $permission, string $ministryId): bool
    {
        $resolved = $this->for($user);

        if ($resolved->administrator || in_array(Permission::MinistriesManageAll->value, $resolved->global, true)) {
            return true;
        }

        return in_array($permission->value, $resolved->ministries[$ministryId] ?? [], true);
    }

    public function isMember(User $user, string $ministryId): bool
    {
        return array_key_exists($ministryId, $this->for($user)->ministries);
    }
}
