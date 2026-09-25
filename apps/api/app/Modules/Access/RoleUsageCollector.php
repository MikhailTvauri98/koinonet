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
        // Дефект типов (задача 29, доделка): раньше этот метод кончался
        // ДВУМЯ разными `return [...]` — глобальная ветка возвращала
        // `'blockers' => []` буквальным литералом без единой мутации. PHPStan
        // видит такой литерал как "заведомо пустой" тип (`array{}`, ноль
        // элементов), точнее любой докблок-аннотации сверху, и Scramble
        // строил из двух веток метода объединение двух РАЗНЫХ форм ответа
        // вместо одной — вплоть до `"blockers": {"items": {"type":"string"},
        // "maxItems": 0}` во втором варианте. Один `return` и один и тот же
        // мутируемый `$blockers`, наполняемый (или нет) по ходу метода, —
        // тот приём, которым остальной код уже отличает форму служения от
        // глобальной (`membersWhoseOnlyRoleItIs`, `Ministry::where(...)`
        // ниже физически не находят совпадений для глобальной роли, так что
        // поведение не меняется, только форма кода).
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
                    'title' => $member->person->fullName(),
                ];
            }
        }

        $carriers = $role->scope === RoleScope::Global
            ? PersonRole::query()->where('role_id', $role->id)->count()
            : MinistryMemberRole::query()->where('role_id', $role->id)->count();

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
