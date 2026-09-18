<?php

declare(strict_types=1);

namespace App\Modules\Access\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Access\Events\PersonRolesChanged;
use App\Modules\Access\Models\PersonRole;
use App\Modules\Access\Models\Role;
use App\Modules\Access\RoleScope;
use App\Modules\Directory\Models\Person;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class SetPersonRoles
{
    public function __construct(private AuditLogger $audit) {}

    /** @param list<string> $roleIds */
    public function handle(Person $person, array $roleIds): void
    {
        $roles = Role::query()->findMany($roleIds);

        foreach ($roles as $role) {
            if ($role->scope !== RoleScope::Global) {
                throw DomainRuleException::because(
                    'role.scope_not_global',
                    'Это роль служения, её нельзя выдать глобально.',
                );
            }
        }

        /** @var list<string> $before */
        $before = [];

        DB::transaction(function () use ($person, $roleIds, &$before): void {
            /** @var list<string> $currentRoleIds */
            $currentRoleIds = $person->globalRoles()->pluck('roles.id')->all();
            $before = $currentRoleIds;

            $system = Role::query()
                ->where('is_system', true)
                ->lockForUpdate()
                ->first();

            $losesAdministrator = $system !== null
                && in_array($system->id, $currentRoleIds, true)
                && ! in_array($system->id, $roleIds, true);

            if ($losesAdministrator
                && PersonRole::query()->where('role_id', $system->id)->count() === 1) {
                throw DomainRuleException::because(
                    'role.last_administrator',
                    'Нельзя снять роль «Администратор» с последнего носителя.',
                );
            }

            PersonRole::query()->where('person_id', $person->id)->delete();

            foreach ($roleIds as $roleId) {
                PersonRole::query()->create([
                    'person_id' => $person->id,
                    'role_id' => $roleId,
                    'assigned_by_user_id' => auth()->id(),
                    'created_at' => now(),
                ]);
            }

            $this->audit->record('person.roles_changed', $person, [
                'before' => $before,
                'after' => $roleIds,
            ]);
        });

        PersonRolesChanged::dispatch($person->id, $person->user()->value('id'));
    }
}
