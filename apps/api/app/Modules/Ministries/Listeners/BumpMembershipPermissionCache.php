<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Listeners;

use App\Modules\Access\PermissionCache;
use App\Modules\Ministries\Events\MemberAdded;
use App\Modules\Ministries\Events\MemberRemoved;
use App\Modules\Ministries\Events\MemberRolesChanged;
use App\Modules\Ministries\Events\MinistryArchived;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\DB;

final readonly class BumpMembershipPermissionCache implements ShouldQueue
{
    public function __construct(private PermissionCache $cache) {}

    public function handle(MemberAdded|MemberRemoved|MemberRolesChanged|MinistryArchived $event): void
    {
        if ($event instanceof MinistryArchived) {
            $this->cache->bump(...$this->accountsOf($event->ministryId));

            return;
        }

        if ($event->userId !== null) {
            $this->cache->bump($event->userId);
        }
    }

    /** @return list<string> */
    private function accountsOf(string $ministryId): array
    {
        return DB::table('ministry_members as m')
            ->join('users as u', 'u.person_id', '=', 'm.person_id')
            ->where('m.ministry_id', $ministryId)
            ->pluck('u.id')
            ->all();
    }
}
