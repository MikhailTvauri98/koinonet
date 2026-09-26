<?php

declare(strict_types=1);

namespace App\Modules\Access\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Access\Contracts\RoleCarrierDetacher;
use App\Modules\Access\Events\RoleDeleted;
use App\Modules\Access\MinistryRoleGuard;
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
        private RoleCarrierDetacher $detachRoleFromMembers,
        private MinistryRoleGuard $ministryGuard,
    ) {}

    public function handle(Role $role): void
    {
        if ($role->is_system) {
            throw DomainRuleException::because(
                'role.system_immutable',
                'Роль «Администратор» удалить нельзя.',
            );
        }

        $this->ministryGuard->ensureEditable($role->ministry_id);

        $usage = $this->usage->for($role);

        if ($usage['blockers'] !== []) {
            throw match ($usage['blockers'][0]['type']) {
                'default_role' => DomainRuleException::because(
                    'role.is_default',
                    'Роль стоит по умолчанию: сначала выберите для служения другую.',
                ),
                'last_role_of_member' => DomainRuleException::because(
                    'role.last_role_of_member',
                    "Роль единственная у участника «{$usage['blockers'][0]['title']}»: сначала добавьте ему другую роль или исключите его из служения.",
                ),
                default => DomainRuleException::because('role.in_use', 'Роль используется и не может быть удалена.'),
            };
        }

        $roleId = $role->id;
        $roleName = $role->name;
        $carriers = $role->carrierUserIds();

        DB::transaction(function () use ($role): void {
            PersonRole::query()->where('role_id', $role->id)->delete();
            // Other carrier tables (e.g. ministry_member_roles) reference roles with composite
            // foreign keys under ON DELETE RESTRICT (section 5): those links must be gone before
            // $role->delete() below, in the same transaction — see RoleCarrierDetacher for why
            // this is a synchronous contract call rather than a queued cross-module listener.
            $this->detachRoleFromMembers->handle($role->id);
            $role->permissions()->delete();
            $role->delete();
        });

        $this->audit->record('role.deleted', null, ['role_id' => $roleId, 'name' => $roleName]);
        RoleDeleted::dispatch($roleId, $carriers);
        $this->cache->bump(...$carriers);
    }
}
