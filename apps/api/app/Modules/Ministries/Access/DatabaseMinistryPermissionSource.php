<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Access;

use App\Modules\Access\Contracts\MinistryPermissionSource;
use Illuminate\Support\Facades\DB;

/** Reads ministry-scoped permissions straight from the membership tables Ministries owns. */
final class DatabaseMinistryPermissionSource implements MinistryPermissionSource
{
    /** @return array<string, list<string>> */
    public function forPerson(string $personId): array
    {
        $rows = DB::table('ministry_members as m')
            ->join('ministries as mi', 'mi.id', '=', 'm.ministry_id')
            ->leftJoin('ministry_member_roles as mr', 'mr.member_id', '=', 'm.id')
            ->leftJoin('role_permissions as rp', 'rp.role_id', '=', 'mr.role_id')
            ->where('m.person_id', $personId)
            ->whereNull('mi.archived_at')
            ->select('m.ministry_id', 'rp.permission')
            ->get();

        $result = [];

        foreach ($rows as $row) {
            $result[$row->ministry_id] ??= [];

            if ($row->permission !== null) {
                $result[$row->ministry_id][] = $row->permission;
            }
        }

        return array_map(fn (array $p) => array_values(array_unique($p)), $result);
    }
}
