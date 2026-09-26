<?php

declare(strict_types=1);

namespace App\Modules\Directory\Contracts;

/**
 * One module's part of erasing an account (architecture 7.9). `people:erase`
 * calls every implementation tagged `directory.account_erasers`, inside its
 * own transaction and before it deletes the `users` row: each module clears
 * the references its own tables hold to that account, which Directory may
 * not write itself (boundary rule 1) and which would otherwise block the
 * deletion or outlive it.
 */
interface AccountEraser
{
    public function eraseAccount(string $userId): void;
}
