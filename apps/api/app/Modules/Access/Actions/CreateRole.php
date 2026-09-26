<?php

declare(strict_types=1);

namespace App\Modules\Access\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Access\MinistryRoleGuard;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\RoleScope;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class CreateRole
{
    public function __construct(
        private SetRolePermissions $setPermissions,
        private AuditLogger $audit,
        private MinistryRoleGuard $ministryGuard,
    ) {}

    /** @param list<Permission> $permissions */
    public function handle(
        RoleScope $scope,
        ?string $ministryId,
        string $name,
        ?string $description,
        array $permissions,
    ): Role {
        $this->ministryGuard->ensureEditable($ministryId);
        $this->ensureNameIsAvailable($scope, $ministryId, $name);

        return DB::transaction(function () use ($scope, $ministryId, $name, $description, $permissions): Role {
            $role = Role::query()->create([
                'scope' => $scope,
                'ministry_id' => $ministryId,
                'name' => $name,
                'description' => $description,
                'is_system' => false,
            ]);

            $this->setPermissions->handle($role, $permissions);
            $this->audit->record('role.created', $role, [
                'name' => $role->name,
                'scope' => $role->scope->value,
                'permissions' => array_map(
                    fn (Permission $permission): string => $permission->value,
                    $permissions,
                ),
            ]);

            return $role->load('permissions');
        });
    }

    private function ensureNameIsAvailable(RoleScope $scope, ?string $ministryId, string $name): void
    {
        $exists = Role::query()
            ->where('scope', $scope)
            ->where('ministry_id', $ministryId)
            ->where('name', $name)
            ->exists();

        if ($exists) {
            throw DomainRuleException::because('role.name_taken', 'Роль с таким названием уже существует.');
        }
    }
}
