<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\RecurrenceRule;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

final readonly class MaterializeTemplate
{
    public function __construct(private ChurchSettings $settings, private CreateEventFromTemplate $create) {}

    public function handle(EventTemplate $template, CarbonImmutable $today): int
    {
        return DB::transaction(function () use ($template, $today): int {
            // Share the parent lock with edits, archiving and manual creation.
            $template = EventTemplate::query()->lockForUpdate()->findOrFail($template->id);
            if (! $template->active || $template->archived_at !== null || $template->ministry?->archived_at !== null) {
                return 0;
            }
            $rule = RecurrenceRule::fromArray($template->recurrence);
            if ($rule === null) {
                return 0;
            }
            $timezone = $this->settings->timezone();
            $today = $today->setTimezone($timezone)->startOfDay();
            $horizon = $today->addWeeks((int) $this->settings->all()['calendar.horizon_weeks']);
            // Eloquent's date cast is UTC midnight; its string is a local calendar date.
            $completed = $template->generated_until === null ? null
                : CarbonImmutable::createFromFormat('!Y-m-d', $template->generated_until->toDateString(), $timezone);
            if ($completed !== null && $completed >= $horizon) {
                return 0;
            }
            $from = $completed === null ? $today : $today->max($completed->addDay());
            $created = 0;
            foreach ($rule->occurrencesBetween($from, $horizon) as $date) {
                if (Event::query()->where('template_id', $template->id)->whereDate('occurrence_date', $date->toDateString())->exists()) {
                    continue;
                }
                $this->create->handle($template, $date, null);
                $created++;
            }
            $template->forceFill(['generated_until' => $horizon->toDateString()])->save();

            return $created;
        });
    }
}
