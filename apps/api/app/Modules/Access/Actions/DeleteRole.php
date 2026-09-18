<?php

declare(strict_types=1);

namespace App\Modules\Access\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Access\Events\RoleDeleted;
use App\Modules\Access\Models\PersonRole;
use App\Modules\Access\Models\Role;
use App\Modules\Access\PermissionCache;
use App\Modules\Access\RoleUsageCollector;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class DeleteRole
{
    public function __construct(
        private RoleUsageCollector $usage,
        private PermissionCache $cache,
        private AuditLogger $audit,
    ) {}

    public function handle(Role $role): void
    {
        if ($role->is_system) {
            throw DomainRuleException::because(
                'role.system_immutable',
                'Роль «Администратор» удалить нельзя.',
            );
        }

        $usage = $this->usage->for($role);

        if ($usage['blockers'] !== []) {
            throw DomainRuleException::because('role.in_use', 'Роль используется и не может быть удалена.');
        }

        $roleId = $role->id;
        $roleName = $role->name;
        $carriers = $role->carrierUserIds();

        DB::transaction(function () use ($role): void {
            PersonRole::query()->where('role_id', $role->id)->delete();
            $role->permissions()->delete();
            $role->delete();
        });

        $this->audit->record('role.deleted', null, ['role_id' => $roleId, 'name' => $roleName]);
        RoleDeleted::dispatch($roleId, $carriers);
        $this->cache->bump(...$carriers);
    }
}
