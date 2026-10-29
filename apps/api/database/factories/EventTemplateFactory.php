<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<EventTemplate> */
final class EventTemplateFactory extends Factory
{
    protected $model = EventTemplate::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'owner_type' => EventOwnerType::Church,
            'ministry_id' => null,
            'title' => 'Воскресное служение',
            'visibility' => EventVisibility::Church,
            'start_time' => '10:00:00',
            'duration_minutes' => 120,
            'recurrence' => null,
            'active' => true,
        ];
    }

    public function ministry(Ministry $ministry): static
    {
        return $this->state(fn (): array => [
            'owner_type' => EventOwnerType::Ministry,
            'ministry_id' => $ministry->id,
            'visibility' => EventVisibility::Ministry,
        ]);
    }

    public function weekly(int $isoWeekday): static
    {
        return $this->state(fn (): array => ['recurrence' => ['type' => 'weekly', 'weekday' => $isoWeekday]]);
    }

    public function biweekly(int $isoWeekday, string $anchorDate): static
    {
        return $this->state(fn (): array => [
            'recurrence' => ['type' => 'biweekly', 'weekday' => $isoWeekday, 'anchor_date' => $anchorDate],
        ]);
    }

    public function monthlyNth(int $nth, int $isoWeekday): static
    {
        return $this->state(fn (): array => [
            'recurrence' => ['type' => 'monthly_nth_weekday', 'nth' => $nth, 'weekday' => $isoWeekday],
        ]);
    }

    public function inactive(): static
    {
        return $this->state(fn (): array => ['active' => false]);
    }

    public function archived(): static
    {
        return $this->state(fn (): array => ['archived_at' => now()]);
    }
}
