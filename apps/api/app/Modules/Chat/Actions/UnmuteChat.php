<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;

final readonly class UnmuteChat
{
    public function __construct(private MuteChat $mute) {}

    public function handle(User $user, Chat $chat): void
    {
        $this->mute->set($user, $chat, null);
    }
}
