<?php

declare(strict_types=1);

namespace App\Modules\Access;

use App\Modules\Access\Contracts\RoleUsageSource;
use App\Modules\Access\Models\PersonRole;
use App\Modules\Access\Models\Role;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Ministries\Models\MinistryMember;
use App\Modules\Ministries\Models\MinistryMemberRole;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Gate;

final class RoleUsageCollector
{
    /** @return array{carriers: int, blockers: list<array{type: string, id: string, title: string}>} */
    public function for(Role $role): array
    {
        // Один `return` с одним наполняемым `$blockers` для обеих областей:
        // отдельная ветка с литералом `'blockers' => []` дала бы для него
        // тип «заведомо пустой массив», и Scramble описал бы ответ двумя
        // разными формами вместо одной.
        /** @var list<array{type: string, id: string, title: string}> $blockers */
        $blockers = [];

        if ($role->scope === RoleScope::Ministry) {
            $ministryId = $role->ministry_id;
            assert($ministryId !== null);

            if (Ministry::query()->where('default_role_id', $role->id)->exists()) {
                $blockers[] = ['type' => 'default_role', 'id' => $ministryId, 'title' => 'Роль по умолчанию'];
            }

            foreach ($this->membersWhoseOnlyRoleItIs($role) as $member) {
                $blockers[] = [
                    'type' => 'last_role_of_member',
                    'id' => $member->id,
                    'title' => Gate::allows('view', $member->person)
                        ? $member->person->fullName() : 'Скрытый человек',
                ];
            }
        }

        $carriers = $role->scope === RoleScope::Global
            ? PersonRole::query()->where('role_id', $role->id)->count()
            : MinistryMemberRole::query()->where('role_id', $role->id)->count();

        /** @var RoleUsageSource $source */
        foreach (app()->tagged('access.role_usage_sources') as $source) {
            foreach ($source->blockersFor($role) as $blocker) {
                $blockers[] = $blocker;
            }
        }

        return [
            'carriers' => $carriers,
            'blockers' => $blockers,
        ];
    }

    /** @return Collection<int, MinistryMember> */
    private function membersWhoseOnlyRoleItIs(Role $role): Collection
    {
        return MinistryMember::query()
            ->whereHas('roles', fn (Builder $query) => $query->where('roles.id', $role->id))
            ->whereDoesntHave('roles', fn (Builder $query) => $query->where('roles.id', '!=', $role->id))
            ->with('person')
            ->get();
    }
}
