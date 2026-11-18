<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

use App\Modules\Calendar\Http\Queries\EventIndexQuery;
use App\Modules\Calendar\Models\Event;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Spatie\IcalendarGenerator\Components\Calendar;
use Spatie\IcalendarGenerator\Components\Event as IcalEvent;
use Spatie\IcalendarGenerator\Enums\EventStatus as IcalEventStatus;

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

        foreach ($events as $event) {
            $calendar->event($this->vevent($event, false));
        }

        return $calendar->get();
    }

    /** One downloadable event for an authenticated viewer: description plus the viewer's own slot labels. */
    public function forEvent(Event $event, Person $viewer): string
    {
        $event->load(['slots' => fn ($slots) => $slots->whereNull('archived_at')
            ->whereHas('assignments', fn (Builder $assignments): Builder => $assignments->whereNull('archived_at')->where('person_id', $viewer->id))]);

        return Calendar::create($this->settings->name())->withoutAutoTimezoneComponents()
            ->event($this->vevent($event, true))->get();
    }

    private function vevent(Event $event, bool $includeDescription): IcalEvent
    {
        $host = parse_url((string) config('app.url'), PHP_URL_HOST) ?: 'church';
        $slots = $event->slots->pluck('label')->implode(', ');
        $vevent = IcalEvent::create($event->title)
            ->uniqueIdentifier("event-{$event->id}@{$host}")
            ->startsAt($event->starts_at->utc()->toDateTime())
            ->endsAt($event->ends_at->utc()->toDateTime())
            ->address((string) $event->location);

        if ($event->status === EventStatus::Cancelled) {
            $vevent->status(IcalEventStatus::Cancelled);
        }

        if (! $includeDescription) {
            return $vevent->description('Слоты: '.$slots);
        }

        $description = implode("\n", array_filter(
            [(string) $event->description, $slots === '' ? '' : 'Слоты: '.$slots],
            fn (string $part): bool => $part !== '',
        ));

        return $description === '' ? $vevent : $vevent->description($description);
    }
}
