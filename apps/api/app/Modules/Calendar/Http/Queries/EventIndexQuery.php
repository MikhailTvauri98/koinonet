<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Queries;

use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\Models\Event;
use App\Modules\Directory\Models\User;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

final readonly class EventIndexQuery
{
    public function __construct(private EventAccess $access, private ChurchSettings $settings) {}

    /** @return Builder<Event> */
    public function for(User $viewer, CarbonImmutable $from, CarbonImmutable $to, string $scope): Builder
    {
        $timezone = $this->settings->timezone();
        // Inputs represent calendar dates, regardless of the Carbon instance timezone.
        $fromUtc = CarbonImmutable::parse($from->toDateString(), $timezone)->startOfDay()->utc();
        $untilUtc = CarbonImmutable::parse($to->toDateString(), $timezone)->startOfDay()->addDay()->utc();
        $query = $this->access->constrainVisibleQuery(Event::query()->whereNull('events.archived_at'), $viewer)
            ->where('starts_at', '<', $untilUtc)->where('ends_at', '>', $fromUtc);

        if ($scope === 'mine') {
            $query->whereHas('slots', fn (Builder $slots): Builder => $slots->whereNull('archived_at')
                ->whereHas('assignments', fn (Builder $assignments): Builder => $assignments->whereNull('archived_at')->where('person_id', $viewer->person_id)));
        } elseif (str_starts_with($scope, 'ministry:')) {
            $query->where('ministry_id', substr($scope, strlen('ministry:')));
        } elseif ($scope !== 'church') {
            // Internal callers cannot accidentally broaden an unsupported scope either.
            $query->whereRaw('1 = 0');
        }

        return $query->with([
            'ministry',
            'attachments.media',
            'slots' => fn ($slots) => $slots->whereNull('archived_at'),
            'slots.role',
            'slots.assignments' => fn ($assignments) => $assignments->whereNull('archived_at')->orderBy('created_at')->orderBy('id'),
            'slots.assignments.person.photo',
        ])->orderBy('starts_at')->orderBy('id');
    }
}
