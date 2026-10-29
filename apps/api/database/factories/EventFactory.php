<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Ministries\Models\Ministry;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Event> */
final class EventFactory extends Factory
{
    protected $model = Event::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'owner_type' => EventOwnerType::Church,
            'ministry_id' => null,
            'title' => 'Воскресное служение',
            'starts_at' => CarbonImmutable::tomorrow('UTC')->setTime(10, 0),
            'ends_at' => CarbonImmutable::tomorrow('UTC')->setTime(12, 0),
            'visibility' => EventVisibility::Church,
            'status' => EventStatus::Scheduled,
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

    public function visibility(EventVisibility $visibility): static
    {
        return $this->state(fn (): array => ['visibility' => $visibility]);
    }

    public function cancelled(): static
    {
        return $this->state(fn (): array => ['status' => EventStatus::Cancelled, 'cancelled_at' => now()]);
    }

    public function between(CarbonImmutable $start, CarbonImmutable $end): static
    {
        return $this->state(fn (): array => ['starts_at' => $start->utc(), 'ends_at' => $end->utc()]);
    }

    public function fromTemplate(EventTemplate $template, string $date): static
    {
        return $this->state(fn (): array => [
            'owner_type' => $template->owner_type,
            'ministry_id' => $template->ministry_id,
            'visibility' => $template->visibility,
            'template_id' => $template->id,
            'occurrence_date' => $date,
        ]);
    }
}
