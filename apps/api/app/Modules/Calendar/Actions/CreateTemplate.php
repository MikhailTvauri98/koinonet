<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\RecurrenceRule;
use App\Modules\Directory\Models\User;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

final readonly class CreateTemplate
{
    public function __construct(private ReplaceTemplateSlots $slots) {}

    /** @param array{owner_type: string, ministry_id?: string|null, title: string, description?: string|null, location?: string|null, visibility: string, start_time: string, duration_minutes: int, recurrence?: array<string, mixed>|null, active?: bool, slots?: list<array{label?: string|null, role_id?: string|null, required_count: int}>} $attributes */
    public function handle(User $creator, array $attributes): EventTemplate
    {
        return DB::transaction(function () use ($creator, $attributes): EventTemplate {
            $template = EventTemplate::query()->create([
                ...Arr::only($attributes, ['owner_type', 'title', 'description', 'location', 'visibility', 'start_time', 'duration_minutes', 'active']),
                'ministry_id' => $attributes['owner_type'] === 'ministry' ? ($attributes['ministry_id'] ?? null) : null,
                'recurrence' => RecurrenceRule::fromArray($attributes['recurrence'] ?? null)?->toArray(),
                'active' => $attributes['active'] ?? true,
                'created_by_user_id' => $creator->id,
            ]);
            $this->slots->handle($template, $attributes['slots'] ?? []);

            return $template;
        });
    }
}
