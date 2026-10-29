<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Policies;

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Announcements\AnnouncementScope;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;

final readonly class AnnouncementPolicy
{
    public function __construct(private PermissionResolver $permissions) {}

    public function create(User $user, AnnouncementScope $scope, ?string $ministryId): bool
    {
        return match ($scope) {
            AnnouncementScope::Church => $this->permissions->can($user, Permission::AnnouncementsChurchPublish),
            AnnouncementScope::Ministry => $ministryId !== null
                && $this->permissions->canInMinistry($user, Permission::AnnouncementsPublish, $ministryId),
        };
    }

    public function update(User $user, Announcement $announcement): bool
    {
        return ! $user->isDisabled() && ($announcement->author_user_id === $user->id
            || $this->create($user, $announcement->scope, $announcement->ministry_id));
    }
}
