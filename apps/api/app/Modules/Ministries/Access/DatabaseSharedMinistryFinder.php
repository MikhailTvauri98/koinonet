<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Access;

use App\Modules\Directory\Contracts\SharedMinistryFinder;
use Illuminate\Support\Facades\DB;

/** Finds ministries two people both belong to — the base for the "colleague sees contacts" rule (6.4). */
final class DatabaseSharedMinistryFinder implements SharedMinistryFinder
{
    /** @return list<string> */
    public function sharedMinistryIds(string $viewerPersonId, string $subjectPersonId): array
    {
        return DB::table('ministry_members as viewer')
            ->join('ministry_members as subject', 'subject.ministry_id', '=', 'viewer.ministry_id')
            ->join('ministries as mi', 'mi.id', '=', 'viewer.ministry_id')
            ->where('viewer.person_id', $viewerPersonId)
            ->where('subject.person_id', $subjectPersonId)
            ->whereNull('mi.archived_at')
            ->pluck('viewer.ministry_id')
            ->unique()
            ->values()
            ->all();
    }
}
