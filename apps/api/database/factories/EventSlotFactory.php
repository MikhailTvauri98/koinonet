<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Access\Models\Role;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\ResourceType;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<EventSlot> */
final class EventSlotFactory extends Factory
{
    protected $model = EventSlot::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'event_id' => Event::factory(),
            'label' => 'Помощник',
            'resource_type' => ResourceType::Person,
            'role_id' => null,
            'required_count' => 1,
            'sort_order' => 0,
        ];
    }

    public function withRole(Role $role): static
    {
        return $this->state(fn (): array => ['role_id' => $role->id, 'label' => $role->name]);
    }
}
