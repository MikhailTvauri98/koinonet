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

    /** @return Builder<User> */
    private function activeAccounts(): Builder
    {
        return User::query()->whereNull('users.disabled_at')
            ->whereHas('person', fn (Builder $query) => $query->whereNull('archived_at'));
    }
}
