<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

use App\Modules\Calendar\Http\Queries\EventIndexQuery;
use App\Modules\Directory\Models\User;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Spatie\IcalendarGenerator\Components\Calendar;
use Spatie\IcalendarGenerator\Components\Event as IcalEvent;

final readonly class IcalFeedBuilder
{
    public function __construct(private EventIndexQuery $events, private ChurchSettings $settings) {}

    public function for(User $user): string
    {
        $today = CarbonImmutable::today($this->settings->timezone());
        $events = $this->events->for($user, $today->subDays(30), $today->addDays(180), 'mine')
            ->where('status', EventStatus::Scheduled)
            // The feed needs only this person's slot labels, never other assignees' data.
            ->setEagerLoads([])->with(['slots' => fn ($slots) => $slots->whereNull('archived_at')
            ->whereHas('assignments', fn (Builder $assignments): Builder => $assignments->whereNull('archived_at')->where('person_id', $user->person_id))])
            ->get();
        $calendar = Calendar::create($this->settings->name())->refreshInterval(60)->withoutAutoTimezoneComponents();
        $host = parse_url((string) config('app.url'), PHP_URL_HOST) ?: 'church';

        foreach ($events as $event) {
            $calendar->event(IcalEvent::create($event->title)
                ->uniqueIdentifier("event-{$event->id}@{$host}")
                ->startsAt($event->starts_at->utc()->toDateTime())
                ->endsAt($event->ends_at->utc()->toDateTime())
                ->address((string) $event->location)
                ->description('Слоты: '.$event->slots->pluck('label')->implode(', ')));
        }

        return $calendar->get();
    }
}
