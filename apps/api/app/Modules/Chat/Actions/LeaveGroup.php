<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;

final readonly class LeaveGroup
{
    public function __construct(private RemoveGroupMember $remove) {}

    public function handle(User $actor, Chat $chat): void
    {
        $this->remove->handle($actor, $chat, $actor->id, true);
    }
}
