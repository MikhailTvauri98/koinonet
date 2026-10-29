<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Policies;

use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\Models\Event;
use App\Modules\Directory\Models\User;

final readonly class EventPolicy
{
    public function __construct(private EventAccess $access) {}

    public function create(User $user, EventOwnerType $owner, ?string $ministryId): bool
    {
        return $this->access->canManageOwner($user, $owner, $ministryId);
    }

    public function view(User $user, Event $event): bool
    {
        return $this->access->canView($user, $event);
    }

    public function update(User $user, Event $event): bool
    {
        return $this->access->canManage($user, $event);
    }

    public function cancel(User $user, Event $event): bool
    {
        return $this->access->canManage($user, $event);
    }
}
