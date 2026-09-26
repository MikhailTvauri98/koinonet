<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Queries;

use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;

final class PersonIndexQuery
{
    /**
     * The `ministry` filter only narrows the list to a ministry `$viewer` may
     * see (`MinistryPolicy::view`); for any other id - hidden or nonexistent
     * alike - the list is empty, so the filter reveals neither who serves in
     * a hidden ministry nor that it exists.
     *
     * @param  array{search?: string, status?: string, ministry?: string, archived: bool, without_roles: bool, per_page: int}  $filters
     * @return LengthAwarePaginator<int, Person>
     */
    public function paginate(array $filters, User $viewer): LengthAwarePaginator
    {
        $search = $filters['search'] ?? null;
        $ministryId = $filters['ministry'] ?? null;
        $ministry = $ministryId === null ? null : Ministry::query()->find($ministryId);
        $ministryVisible = $ministry !== null && Gate::forUser($viewer)->allows('view', $ministry);

        return Person::query()
            ->withCardFlags()
            ->with('photo')
            ->when(
                $search !== null,
                fn (Builder $query): Builder => $query
                    ->whereRaw(
                        "lower(last_name || ' ' || first_name) % ?",
                        [mb_strtolower($search)],
                    )
                    ->orderByRaw(
                        "similarity(lower(last_name || ' ' || first_name), ?) desc",
                        [mb_strtolower($search)],
                    ),
            )
            ->when(
                isset($filters['status']),
                fn (Builder $query): Builder => $query->where('status', $filters['status']),
            )
            ->when(
                $ministryId !== null,
                fn (Builder $query): Builder => $ministryVisible
                    ? $query->whereHas(
                        'ministryMemberships',
                        fn (Builder $memberships): Builder => $memberships->where('ministry_id', $ministryId),
                    )
                    : $query->whereRaw('1 = 0'),
            )
            ->when(
                $filters['archived'],
                fn (Builder $query): Builder => $query->whereNotNull('archived_at'),
                fn (Builder $query): Builder => $query->whereNull('archived_at'),
            )
            ->when(
                $filters['without_roles'],
                fn (Builder $query): Builder => $query->whereDoesntHave('globalRoles'),
            )
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->orderBy('id')
            ->paginate($filters['per_page'])
            ->withQueryString();
    }
}
