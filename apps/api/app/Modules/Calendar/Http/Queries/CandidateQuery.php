<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Queries;

use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Gate;

final class CandidateQuery
{
    /** @return Collection<int, Person> */
    public function forSlot(EventSlot $slot, string $search, User $viewer): Collection
    {
        $query = Person::query()->whereNull('archived_at')->with('photo');
        if ($slot->role_id !== null) {
            $query->whereHas('ministryMemberships', fn (Builder $members): Builder => $members
                ->whereHas('ministry', fn (Builder $ministries): Builder => $ministries->whereNull('archived_at'))
                ->whereHas('roles', fn (Builder $roles): Builder => $roles->whereKey($slot->role_id)));
        } else {
            if (mb_strlen($search) === 1) {
                return new Collection;
            }
            if (! Gate::forUser($viewer)->allows('viewAny', Person::class)) {
                $query->whereKey($viewer->person_id);
            }
            if ($search === '') {
                return $query->orderBy('last_name')->orderBy('first_name')->orderBy('id')->limit(20)->get();
            }
            $search = mb_strtolower($search);
            // Same complementary trigram measures and ranking as Directory's person search.
            $query->where(fn (Builder $match): Builder => $match
                ->whereRaw("lower(last_name || ' ' || first_name) % ?", [$search])
                ->orWhereRaw("? <% lower(last_name || ' ' || first_name)", [$search]))
                ->orderByRaw("greatest(similarity(lower(last_name || ' ' || first_name), ?), word_similarity(?, lower(last_name || ' ' || first_name))) desc", [$search, $search])
                ->limit(20);
        }

        return $query->orderBy('last_name')->orderBy('first_name')->orderBy('id')->get();
    }
}
