<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Calendar\Models\Event;
use App\Modules\Directory\Models\User;

final readonly class EventAccess
{
    public function __construct(private PermissionResolver $permissions) {}

    public function canManage(User $user, Event $event): bool
    {
        return $this->canManageOwner($user, $event->owner_type, $event->ministry_id);
    }

    public function canManageOwner(User $user, EventOwnerType $owner, ?string $ministryId): bool
    {
        return $owner === EventOwnerType::Church
            ? $this->permissions->can($user, Permission::CalendarChurchManage)
            : $ministryId !== null && $this->permissions->canInMinistry($user, Permission::EventsManage, $ministryId);
    }

    public function canView(User $user, Event $event): bool
    {
        return $this->canManage($user, $event)
            || ($event->archived_at === null && $event->visibility === EventVisibility::Church);
    }
}
