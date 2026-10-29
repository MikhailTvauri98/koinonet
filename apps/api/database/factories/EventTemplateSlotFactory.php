<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Access\Models\Role;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Calendar\Models\EventTemplateSlot;
use App\Modules\Calendar\ResourceType;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<EventTemplateSlot> */
final class EventTemplateSlotFactory extends Factory
{
    protected $model = EventTemplateSlot::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'template_id' => EventTemplate::factory(),
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
