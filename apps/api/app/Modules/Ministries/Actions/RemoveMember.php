<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Ministries\Events\MemberRemoved;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Ministries\Models\MinistryMember;
use Illuminate\Support\Facades\DB;

final readonly class RemoveMember
{
    public function __construct(private AuditLogger $audit) {}

    public function handle(Ministry $ministry, MinistryMember $member): void
    {
        $personId = $member->person_id;
        $userId = $member->person->user?->id;

        DB::transaction(function () use ($member): void {
            $member->roles()->detach();
            $member->delete();
        });

        $this->audit->record('member.removed', null, [
            'ministry_id' => $ministry->id,
            'person_id' => $personId,
        ]);
        MemberRemoved::dispatch($ministry->id, $personId, $userId);
    }
}
