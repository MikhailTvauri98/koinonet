<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Actions;

use App\Modules\Ministries\Models\MinistryMemberRole;

final class DetachRoleFromMembers
{
    /** Strips a role from every member carrying it — the link a deleted role must not leave behind. */
    public function handle(string $roleId): void
    {
        MinistryMemberRole::query()->where('role_id', $roleId)->delete();
    }
}
