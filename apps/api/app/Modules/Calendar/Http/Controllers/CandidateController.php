<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Controllers;

use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\Http\Queries\CandidateQuery;
use App\Modules\Calendar\Http\Resources\CandidateResource;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\SlotCandidate;
use App\Modules\Calendar\TimeConflictFinder;
use App\Modules\Directory\Models\User;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

final class CandidateController
{
    /**
     * Candidates for an authorized slot. Free slots preview up to twenty active
     * visible people in stable name/id order for an empty search; one character
     * returns no results, two or more use ranked search. Role slots retain their
     * membership list. Person identities and conflict details retain visibility rules.
     */
    public function index(Request $request, EventSlot $slot, CandidateQuery $query, TimeConflictFinder $finder, EventAccess $access): AnonymousResourceCollection
    {
        abort_if($slot->archived_at !== null || $slot->event->archived_at !== null, 404);
        Gate::authorize('fill', $slot);
        $request->validate(['search' => ['sometimes', 'nullable', 'string', 'max:200']]);
        $viewer = $request->user();
        assert($viewer instanceof User);
        $people = $query->forSlot($slot, trim($request->string('search')->toString()), $viewer);
        $event = $slot->event;
        $conflicts = $people->isEmpty() ? new Collection
            : $finder->conflictsForPeople($people->modelKeys(), $event->starts_at, $event->ends_at, $event->id);
        $visibleIds = $conflicts->isEmpty() ? []
            : $access->constrainVisibleQuery(Event::query()->whereKey($conflicts->modelKeys()), $viewer)->pluck('id')->all();
        $byPerson = [];
        foreach ($conflicts as $conflict) {
            $visible = in_array($conflict->id, $visibleIds, true);
            $item = [
                'event_id' => $visible ? $conflict->id : null,
                'title' => $visible ? $conflict->title : 'Пересечение с недоступным событием',
                'starts_at' => $visible ? $conflict->starts_at->toISOString() : null,
                'ends_at' => $visible ? $conflict->ends_at->toISOString() : null,
            ];
            $personIds = $conflict->slots->flatMap(fn ($conflictSlot) => $conflictSlot->assignments->pluck('person_id'))->unique();
            foreach ($personIds as $personId) {
                $byPerson[$personId][] = $item;
            }
        }

        return CandidateResource::collection($people->map(fn ($person): SlotCandidate => new SlotCandidate(
            $person, $slot->role_id !== null, $byPerson[$person->id] ?? [],
        )));
    }
}
