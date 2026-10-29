<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Policies;

use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\User;

final readonly class EventSlotPolicy
{
    public function __construct(private EventAccess $access) {}

    public function manage(User $user, EventSlot $slot): bool
    {
        return $this->access->canManage($user, $slot->event);
    }
}
