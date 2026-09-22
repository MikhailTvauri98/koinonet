<?php

declare(strict_types=1);

namespace App\Modules\Access;

use App\Modules\Access\Models\PersonRole;
use App\Modules\Access\Models\Role;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Ministries\Models\MinistryMember;
use App\Modules\Ministries\Models\MinistryMemberRole;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

final class RoleUsageCollector
{
    /** @return array{carriers: int, blockers: list<array{type: string, id: string, title: string}>} */
    public function for(Role $role): array
    {
        if ($role->scope === RoleScope::Global) {
            return [
                'carriers' => PersonRole::query()->where('role_id', $role->id)->count(),
                'blockers' => [],
            ];
        }

        $ministryId = $role->ministry_id;
        assert($ministryId !== null);

        $blockers = [];

        if (Ministry::query()->where('default_role_id', $role->id)->exists()) {
            $blockers[] = ['type' => 'default_role', 'id' => $ministryId, 'title' => 'Роль по умолчанию'];
        }

        foreach ($this->membersWhoseOnlyRoleItIs($role) as $member) {
            $blockers[] = [
                'type' => 'last_role_of_member',
                'id' => $member->id,
                'title' => $member->person->fullName(),
            ];
        }

        return [
            'carriers' => MinistryMemberRole::query()->where('role_id', $role->id)->count(),
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
