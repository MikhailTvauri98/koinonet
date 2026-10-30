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
     * @param  array{search?: string, status?: string, ministry?: string, archived: bool, without_roles: bool, has_account?: bool, per_page: int}  $filters
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
            ->when(array_key_exists('has_account', $filters), fn (Builder $query): Builder => $filters['has_account']
                ? $query->whereHas('user') : $query->whereDoesntHave('user'))
            ->when(
                $search !== null,
                // Each measure finds what the other misses. The beginning of a
                // surname is close only to part of "surname name": "смирн" scores
                // 0.24 against "смирнова александра" as a whole, under the 0.3 of
                // `%`, and 0.83 by word similarity (`<%`, threshold 0.6). The
                // beginnings of both words are close to the whole string instead:
                // "петр ив" scores 0.43 against "петров иван" by `%` but 0.55 by
                // word similarity, under its threshold.
                fn (Builder $query): Builder => $query
                    ->where(fn (Builder $match): Builder => $match
                        ->whereRaw("lower(last_name || ' ' || first_name) % ?", [mb_strtolower($search)])
                        ->orWhereRaw("? <% lower(last_name || ' ' || first_name)", [mb_strtolower($search)]))
                    ->orderByRaw(
                        "greatest(similarity(lower(last_name || ' ' || first_name), ?),
                            word_similarity(?, lower(last_name || ' ' || first_name))) desc",
                        [mb_strtolower($search), mb_strtolower($search)],
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
