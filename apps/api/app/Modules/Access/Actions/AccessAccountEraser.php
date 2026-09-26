<?php

declare(strict_types=1);

namespace App\Modules\Access\Actions;

use App\Modules\Access\Models\PersonRole;
use App\Modules\Directory\Contracts\AccountEraser;

/**
 * Access's part of erasing an account (architecture 7.9): the global roles
 * the account granted stay with their carriers, only the link to who
 * granted them is dropped.
 */
final readonly class AccessAccountEraser implements AccountEraser
{
    public function eraseAccount(string $userId): void
    {
        PersonRole::query()->where('assigned_by_user_id', $userId)->update(['assigned_by_user_id' => null]);
    }
}
