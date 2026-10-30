<?php

declare(strict_types=1);

namespace App\Modules\Chat\Policies;

use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;

final readonly class MessagePolicy
{
    public function __construct(private ChatAccess $access) {}

    public function create(User $user, Chat $chat): bool
    {
        return $this->access->canWrite($user, $chat);
    }
}
