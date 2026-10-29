<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\RecurrenceRule;
use App\Support\DomainRuleException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

final readonly class UpdateTemplate
{
    public function __construct(private ReplaceTemplateSlots $slots) {}

    /** @param array{title?: string, description?: string|null, location?: string|null, visibility?: string, start_time?: string, duration_minutes?: int, recurrence?: array<string, mixed>|null, active?: bool, slots?: list<array{label?: string|null, role_id?: string|null, required_count: int}>} $attributes */
    public function handle(EventTemplate $template, array $attributes): EventTemplate
    {
        return DB::transaction(function () use ($template, $attributes): EventTemplate {
            $template = EventTemplate::query()->lockForUpdate()->findOrFail($template->id);
            if ($template->archived_at !== null) {
                throw DomainRuleException::because('template.archived', 'Архивный шаблон изменить нельзя.');
            }
            $updates = Arr::only($attributes, ['title', 'description', 'location', 'visibility', 'start_time', 'duration_minutes', 'active']);
            if (array_key_exists('recurrence', $attributes)) {
                $updates['recurrence'] = RecurrenceRule::fromArray($attributes['recurrence'])?->toArray();
            }
            $template->fill($updates)->save();
            if (array_key_exists('slots', $attributes)) {
                $this->slots->handle($template, $attributes['slots']);
            }

            return $template;
        });
    }
}
