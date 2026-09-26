<?php

declare(strict_types=1);

namespace App\Modules\Access\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Access\MinistryRoleGuard;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionCache;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class UpdateRole
{
    public function __construct(
        private SetRolePermissions $setPermissions,
        private PermissionCache $cache,
        private AuditLogger $audit,
        private MinistryRoleGuard $ministryGuard,
    ) {}

    /** @param list<Permission>|null $permissions */
    public function handle(Role $role, ?string $name, ?string $description, ?array $permissions): Role
    {
        if ($role->is_system) {
            throw DomainRuleException::because(
                'role.system_immutable',
                'Роль «Администратор» изменить нельзя.',
            );
        }

        $this->ministryGuard->ensureEditable($role->ministry_id);

        if ($name !== null && $name !== $role->name) {
            $exists = Role::query()
                ->whereKeyNot($role->id)
                ->where('scope', $role->scope)
                ->where('ministry_id', $role->ministry_id)
                ->where('name', $name)
                ->exists();

            if ($exists) {
                throw DomainRuleException::because('role.name_taken', 'Роль с таким названием уже существует.');
            }
        }

        $before = [
            'name' => $role->name,
            'description' => $role->description,
            'permissions' => $role->permissions()->pluck('permission')->all(),
        ];

        $carriers = $role->carrierUserIds();

        DB::transaction(function () use ($role, $name, $description, $permissions): void {
            $role->fill([
                ...($name === null ? [] : ['name' => $name]),
                'description' => $description,
            ]);
            $role->save();

            if ($permissions !== null) {
                $this->setPermissions->handle($role, $permissions);
            }
        });

        if ($permissions === null) {
            $this->cache->bump(...$carriers);
        }

        $role->load('permissions');
        $this->audit->record('role.updated', $role, [
            'before' => $before,
            'after' => [
                'name' => $role->name,
                'description' => $role->description,
                'permissions' => $role->permissions->pluck('permission')->all(),
            ],
        ]);

        return $role;
    }
}
