<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

use App\Modules\Calendar\Models\Event;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;

final class TimeConflictFinder
{
    /** @return Collection<int, Event> */
    public function conflictsFor(string $personId, CarbonImmutable $from, CarbonImmutable $to, ?string $exceptEventId = null): Collection
    {
        return $this->conflictsForPeople([$personId], $from, $to, $exceptEventId);
    }

    /**
     * @param  list<string>  $personIds
     * @return Collection<int, Event>
     */
    public function conflictsForPeople(array $personIds, CarbonImmutable $from, CarbonImmutable $to, ?string $exceptEventId = null): Collection
    {
        return Event::query()->where('status', EventStatus::Scheduled)->whereNull('archived_at')
            ->where('starts_at', '<', $to)->where('ends_at', '>', $from)
            ->when($exceptEventId !== null, fn (Builder $query): Builder => $query->where('id', '!=', $exceptEventId))
            ->whereHas('slots', fn (Builder $slots): Builder => $slots->whereNull('archived_at')
                ->whereHas('assignments', fn (Builder $assignments): Builder => $assignments->whereNull('archived_at')->whereIn('person_id', $personIds)))
            ->with(['slots' => fn ($slots) => $slots->whereNull('archived_at'),
                'slots.assignments' => fn ($assignments) => $assignments->whereNull('archived_at')->whereIn('person_id', $personIds)])
            ->orderBy('starts_at')->orderBy('id')->get();
    }
}
