<?php

declare(strict_types=1);

namespace App\Modules\Notifications;

use App\Modules\Directory\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\LazyCollection;

final class Recipients
{
    /** @return LazyCollection<int, User> */
    public function allActive(): LazyCollection
    {
        return $this->activeAccounts()->lazy();
    }

    /** @return LazyCollection<int, User> */
    public function ministryMembers(string $ministryId): LazyCollection
    {
        return $this->activeAccounts()
            ->join('ministry_members', 'ministry_members.person_id', '=', 'users.person_id')
            ->where('ministry_members.ministry_id', $ministryId)
            ->select('users.*')
            ->lazy();
    }

    /** @return LazyCollection<int, User> */
    public function assignedToEvent(string $eventId): LazyCollection
    {
        return $this->activeAccounts()
            ->join('event_assignments', 'event_assignments.person_id', '=', 'users.person_id')
            ->join('event_slots', 'event_slots.id', '=', 'event_assignments.slot_id')
            ->join('events', 'events.id', '=', 'event_slots.event_id')
            ->where('events.id', $eventId)
            ->whereNull('events.archived_at')
            ->whereNull('event_slots.archived_at')
            ->whereNull('event_assignments.archived_at')
            ->select('users.*')->distinct()->lazy();
    }

    /** @return Builder<User> */
    private function activeAccounts(): Builder
    {
        return User::query()->whereNull('users.disabled_at')
            ->whereHas('person', fn (Builder $query) => $query->whereNull('archived_at'));
    }
}
