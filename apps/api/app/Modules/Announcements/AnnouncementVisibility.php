<?php

declare(strict_types=1);

namespace App\Modules\Announcements;

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use Illuminate\Database\Eloquent\Builder;

final readonly class AnnouncementVisibility
{
    public function __construct(private PermissionResolver $permissions) {}

    public function canSee(User $viewer, Announcement $announcement): bool
    {
        if ($viewer->isDisabled()) {
            return false;
        }

        if ($announcement->archived_at !== null) {
            return $this->canManage($viewer, $announcement);
        }

        return $announcement->scope === AnnouncementScope::Church
            || ($announcement->ministry_id !== null && $this->permissions->isMember($viewer, $announcement->ministry_id))
            || $this->permissions->can($viewer, Permission::MinistriesViewAll)
            || $this->canManage($viewer, $announcement);
    }

    public function canManage(User $viewer, Announcement $announcement): bool
    {
        if ($viewer->isDisabled()) {
            return false;
        }

        return $announcement->author_user_id === $viewer->id
            || ($announcement->scope === AnnouncementScope::Church
                ? $this->permissions->can($viewer, Permission::AnnouncementsChurchPublish)
                : ($announcement->ministry_id !== null
                    && $this->permissions->canInMinistry($viewer, Permission::AnnouncementsPublish, $announcement->ministry_id)));
    }

    /**
     * SQL equivalent of canSee for active announcements. Every membership grants
     * reading, while canInMinistry grants non-members access through manage_all
     * or the administrator marker. Authorship remains visible after membership ends.
     *
     * @param  Builder<Announcement>  $query
     * @return Builder<Announcement>
     */
    public function constrainActiveQuery(Builder $query, User $viewer): Builder
    {
        if ($viewer->isDisabled()) {
            return $query->whereRaw('1 = 0');
        }

        if ($this->permissions->can($viewer, Permission::MinistriesViewAll)
            || $this->permissions->can($viewer, Permission::MinistriesManageAll)) {
            return $query;
        }

        $ministryIds = array_keys($this->permissions->for($viewer)->ministries);

        return $query->where(function (Builder $visible) use ($viewer, $ministryIds): void {
            $visible->where('scope', AnnouncementScope::Church)
                ->orWhere('author_user_id', $viewer->id)
                ->orWhereIn('ministry_id', $ministryIds);
        });
    }
}
