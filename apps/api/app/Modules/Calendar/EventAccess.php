<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Database\Eloquent\Builder;

final readonly class EventAccess
{
    public function __construct(private PermissionResolver $permissions) {}

    public function canManage(User $user, Event $event): bool
    {
        return $this->canManageOwner($user, $event->owner_type, $event->ministry_id);
    }

    public function canFillSlot(User $user, EventSlot $slot): bool
    {
        return ! $slot->event->isCancelled() && $this->canAssignSlot($user, $slot);
    }

    // Mutation policies allow authorized callers to receive the domain cancellation error.
    public function canAssignSlot(User $user, EventSlot $slot): bool
    {
        if ($user->isDisabled() || $slot->archived_at !== null || $slot->event->archived_at !== null) {
            return false;
        }
        if ($this->canManage($user, $slot->event)) {
            return true;
        }
        $role = $slot->role;

        return $role !== null && $role->ministry_id !== null
            && $this->permissions->canInMinistry($user, Permission::SlotsAssign, $role->ministry_id)
            && Ministry::query()->whereKey($role->ministry_id)->whereNull('archived_at')->exists();
    }

    public function canManageOwner(User $user, EventOwnerType $owner, ?string $ministryId): bool
    {
        return $owner === EventOwnerType::Church
            ? $this->permissions->can($user, Permission::CalendarChurchManage)
            : $ministryId !== null && $this->permissions->canInMinistry($user, Permission::EventsManage, $ministryId);
    }

    public function canView(User $user, Event $event): bool
    {
        return $event->archived_at !== null
            ? $this->canManage($user, $event)
            : $this->constrainVisibleQuery(Event::query()->whereKey($event->id), $user)->exists();
    }

    public function canViewTemplate(User $user, EventTemplate $template): bool
    {
        return $this->constrainVisibleTemplatesQuery(EventTemplate::query()->whereKey($template->id), $user)->exists();
    }

    public function canManageTemplate(User $user, EventTemplate $template): bool
    {
        return $this->canManageOwner($user, $template->owner_type, $template->ministry_id);
    }

    /**
     * Includes archived history only for managers. Lists may further exclude archives.
     *
     * @param  Builder<EventTemplate>  $query
     * @return Builder<EventTemplate>
     */
    public function constrainVisibleTemplatesQuery(Builder $query, User $user): Builder
    {
        if ($user->isDisabled()) {
            return $query->whereRaw('1 = 0');
        }
        $resolved = $this->permissions->for($user);
        if ($resolved->administrator) {
            return $query;
        }
        $manageChurch = $this->permissions->can($user, Permission::CalendarChurchManage);
        $manageAll = $this->permissions->can($user, Permission::MinistriesManageAll);
        $managed = array_keys(array_filter($resolved->ministries,
            fn (array $keys): bool => in_array(Permission::EventsManage->value, $keys, true)));
        $visible = $this->visibleMinistryIds($user);

        return $query->where(function (Builder $allowed) use ($manageChurch, $manageAll, $managed, $visible): void {
            $allowed->where(function (Builder $live) use ($visible): void {
                $live->whereNull('archived_at')->where(function (Builder $public) use ($visible): void {
                    $public->where(fn (Builder $church): Builder => $church->where('owner_type', EventOwnerType::Church)->where('visibility', EventVisibility::Church))
                        ->orWhere(fn (Builder $ministry): Builder => $ministry->where('owner_type', EventOwnerType::Ministry)->whereIn('ministry_id', $visible));
                });
            });
            if ($manageChurch) {
                $allowed->orWhere('owner_type', EventOwnerType::Church);
            }
            $allowed->orWhere(function (Builder $ministry) use ($manageAll, $managed): void {
                $ministry->where('owner_type', EventOwnerType::Ministry)
                    ->when(! $manageAll, fn (Builder $owned): Builder => $owned->whereIn('ministry_id', $managed));
            });
        });
    }

    /** @return list<string> */
    public function visibleMinistryIds(User $user, ?Permission $permission = null): array
    {
        $resolved = $this->permissions->for($user);
        $all = $resolved->administrator
            || in_array(Permission::MinistriesManageAll->value, $resolved->global, true)
            || ($permission === null && in_array(Permission::MinistriesViewAll->value, $resolved->global, true));
        $ids = array_keys(array_filter($resolved->ministries,
            fn (array $keys): bool => $permission === null || in_array($permission->value, $keys, true)));

        return Ministry::query()->whereNull('archived_at')
            ->when(! $all, fn (Builder $query): Builder => $query->whereIn('id', $ids))
            ->pluck('id')->all();
    }

    /**
     * The shared live visibility predicate; callers choose whether archived history is allowed.
     *
     * @param  Builder<Event>  $query
     * @return Builder<Event>
     */
    public function constrainVisibleQuery(Builder $query, User $user): Builder
    {
        if ($user->isDisabled()) {
            return $query->whereRaw('1 = 0');
        }
        if ($this->permissions->for($user)->administrator) {
            return $query;
        }
        $visibleMinistries = $this->visibleMinistryIds($user);
        $managedMinistries = $this->visibleMinistryIds($user, Permission::EventsManage);
        $assignedMinistries = $this->visibleMinistryIds($user, Permission::SlotsAssign);
        $viewAll = $this->permissions->can($user, Permission::MinistriesViewAll)
            || $this->permissions->can($user, Permission::MinistriesManageAll);
        $manageChurch = $this->permissions->can($user, Permission::CalendarChurchManage);

        return $query->where(function (Builder $visible) use ($user, $visibleMinistries, $managedMinistries, $assignedMinistries, $viewAll, $manageChurch): void {
            $visible->where('visibility', EventVisibility::Church)
                ->orWhere(fn (Builder $ministry): Builder => $ministry->where('visibility', EventVisibility::Ministry)->whereIn('ministry_id', $visibleMinistries));
            if ($manageChurch) {
                $visible->orWhere('owner_type', EventOwnerType::Church);
            }
            $visible->orWhere(fn (Builder $managed): Builder => $managed->where('owner_type', EventOwnerType::Ministry)->whereIn('ministry_id', $managedMinistries));
            if ($viewAll) {
                $visible->orWhere('owner_type', EventOwnerType::Ministry);
            }
            $visible->orWhereHas('slots', fn (Builder $slots): Builder => $slots->whereNull('archived_at')
                ->whereHas('assignments', fn (Builder $assignments): Builder => $assignments->whereNull('archived_at')->where('person_id', $user->person_id)));
            $visible->orWhere(fn (Builder $assigned): Builder => $assigned->where('visibility', EventVisibility::Assigned)
                ->whereHas('slots', fn (Builder $slots): Builder => $slots->whereNull('archived_at')
                    ->whereHas('role', fn (Builder $roles): Builder => $roles->whereIn('ministry_id', $assignedMinistries))));
        });
    }
}
