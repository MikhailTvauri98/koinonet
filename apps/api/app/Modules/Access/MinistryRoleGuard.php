<?php

declare(strict_types=1);

namespace App\Modules\Access;

use App\Modules\Ministries\Models\Ministry;

/**
 * A ministry role belongs to its ministry: once the ministry is archived, its
 * roles are neither created, edited nor deleted (architecture 7.3). Global
 * roles have no ministry and pass.
 */
final readonly class MinistryRoleGuard
{
    public function ensureEditable(?string $ministryId): void
    {
        if ($ministryId === null) {
            return;
        }

        Ministry::query()->findOrFail($ministryId)->ensureNotArchived();
    }
}
