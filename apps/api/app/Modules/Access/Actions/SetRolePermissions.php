<?php

declare(strict_types=1);

namespace App\Modules\Access\Actions;

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionCache;
use App\Modules\Access\PermissionScope;
use App\Modules\Access\RoleScope;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class SetRolePermissions
{
    public function __construct(private PermissionCache $cache) {}

    /** @param list<Permission> $permissions */
    public function handle(Role $role, array $permissions): void
    {
        $expected = $role->scope === RoleScope::Global
            ? PermissionScope::Global
            : PermissionScope::Ministry;

        foreach ($permissions as $permission) {
            if ($permission->scope() !== $expected) {
                throw DomainRuleException::because(
                    'role.permission_scope_mismatch',
                    "Право «{$permission->label()}» нельзя выдать роли этого уровня.",
                );
            }
        }

        $role->permissions()->delete();
        $role->permissions()->createMany(array_map(
            fn (Permission $permission): array => ['permission' => $permission->value],
            $permissions,
        ));

        // Inside a caller's transaction the bump waits for its commit: bumped
        // earlier, a concurrent request would recompute permissions from the
        // not yet committed rows and cache the old set under the new version
        // until the cache expires. Outside a transaction it runs at once.
        $carriers = $role->carrierUserIds();
        DB::afterCommit(fn () => $this->cache->bump(...$carriers));
    }
}
