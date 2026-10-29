<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Events\EventCreated;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Directory\Models\User;
use App\Modules\Settings\ChurchSettings;
use App\Support\DomainRuleException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final readonly class CreateEventFromTemplate
{
    public function __construct(private ChurchSettings $settings) {}

    public function handle(EventTemplate $template, CarbonImmutable $date, ?User $creator): Event
    {
        return DB::transaction(function () use ($template, $date, $creator): Event {
            $template = EventTemplate::query()->lockForUpdate()->findOrFail($template->id);
            if ($template->archived_at !== null) {
                throw DomainRuleException::because('template.archived', 'Шаблон архивирован.');
            }
            $template->ministry?->ensureNotArchived();
            $occurrenceDate = $date->toDateString();
            if (Event::query()->where('template_id', $template->id)->whereDate('occurrence_date', $occurrenceDate)->exists()) {
                throw DomainRuleException::because('event.occurrence_exists', 'Событие на эту дату уже создано из шаблона.');
            }
            $startsAt = CarbonImmutable::createFromFormat('!Y-m-d H:i', $occurrenceDate.' '.substr($template->start_time, 0, 5), $this->settings->timezone())->utc();
            $event = Event::query()->create([
                'owner_type' => $template->owner_type,
                'ministry_id' => $template->ministry_id,
                'template_id' => $template->id,
                'occurrence_date' => $occurrenceDate,
                'title' => $template->title,
                'description' => $template->description,
                'location' => $template->location,
                'visibility' => $template->visibility,
                'starts_at' => $startsAt,
                'ends_at' => $startsAt->addMinutes($template->duration_minutes),
                'status' => EventStatus::Scheduled,
                'created_by_user_id' => $creator?->id,
            ]);
            foreach ($template->slots()->whereNull('archived_at')->get() as $slot) {
                $event->slots()->create($slot->only(['label', 'resource_type', 'role_id', 'required_count', 'sort_order']));
            }
            EventCreated::dispatch($event->id, 'none');

            return $event;
        });
    }
}
