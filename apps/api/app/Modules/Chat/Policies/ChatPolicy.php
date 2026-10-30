<?php

declare(strict_types=1);

namespace App\Modules\Chat\Policies;

use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;

final readonly class ChatPolicy
{
    public function __construct(private ChatAccess $access) {}

    public function viewAny(User $user): bool
    {
        return ! $user->isDisabled();
    }

    public function view(User $user, Chat $chat): bool
    {
        return $this->access->canRead($user, $chat);
    }

    public function mute(User $user, Chat $chat): bool
    {
        return $this->access->canMute($user, $chat);
    }
}
