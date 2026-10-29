<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\ResourceType;
use App\Modules\Directory\Models\Person;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<EventAssignment> */
final class EventAssignmentFactory extends Factory
{
    protected $model = EventAssignment::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'slot_id' => EventSlot::factory(),
            'resource_type' => ResourceType::Person,
            'person_id' => Person::factory(),
            'assigned_by_user_id' => null,
        ];
    }
}
