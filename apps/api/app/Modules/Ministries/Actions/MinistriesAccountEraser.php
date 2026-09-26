<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Actions;

use App\Modules\Directory\Contracts\AccountEraser;
use App\Modules\Ministries\Models\MinistryMember;

/**
 * Ministries' part of erasing an account (architecture 7.9): the members the
 * account added stay in their ministries, only the link to who added them
 * is dropped.
 */
final readonly class MinistriesAccountEraser implements AccountEraser
{
    public function eraseAccount(string $userId): void
    {
        MinistryMember::query()->where('added_by_user_id', $userId)->update(['added_by_user_id' => null]);
    }
}
