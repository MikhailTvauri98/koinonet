<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Queries;

use App\Modules\Directory\Models\Person;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

final class PersonIndexQuery
{
    /**
     * @param  array{search?: string, status?: string, ministry?: string, archived: bool, without_roles: bool, per_page: int}  $filters
     * @return LengthAwarePaginator<int, Person>
     */
    public function paginate(array $filters): LengthAwarePaginator
    {
        $search = $filters['search'] ?? null;
        $ministryId = $filters['ministry'] ?? null;

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
                fn (Builder $query): Builder => $query->whereHas(
                    'ministryMemberships',
                    fn (Builder $memberships): Builder => $memberships->where('ministry_id', $ministryId),
                ),
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
