<?php

declare(strict_types=1);

namespace App\Modules\Access\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Access\Events\RoleDeleted;
use App\Modules\Access\Models\PersonRole;
use App\Modules\Access\Models\Role;
use App\Modules\Access\PermissionCache;
use App\Modules\Access\RoleUsageCollector;
use App\Modules\Ministries\Models\MinistryMemberRole;
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
            // ministry_member_roles is Ministries' table, but roles(id, ministry_id) is referenced
            // with ON DELETE RESTRICT (section 5): the carrier link must be gone before $role->delete()
            // below, in the same transaction, so a queued cross-module listener cannot do this in time.
            MinistryMemberRole::query()->where('role_id', $role->id)->delete();
            $role->permissions()->delete();
            $role->delete();
        });

        $this->audit->record('role.deleted', null, ['role_id' => $roleId, 'name' => $roleName]);
        RoleDeleted::dispatch($roleId, $carriers);
        $this->cache->bump(...$carriers);
    }
}
