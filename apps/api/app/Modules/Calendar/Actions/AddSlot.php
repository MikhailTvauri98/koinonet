<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\ResourceType;
use App\Modules\Calendar\SlotAttributes;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class AddSlot
{
    public function __construct(private SlotAttributes $definition) {}

    /** @param array{label?: string|null, role_id?: string|null, required_count: int, sort_order?: int} $attributes */
    public function handle(Event $event, array $attributes): EventSlot
    {
        return DB::transaction(function () use ($event, $attributes): EventSlot {
            $event = Event::query()->lockForUpdate()->findOrFail($event->id);
            if ($event->isCancelled()) {
                throw DomainRuleException::because('event.cancelled', 'Слоты отменённого события изменить нельзя.');
            }
            $definition = $this->definition->resolve($attributes['label'] ?? null, $attributes['role_id'] ?? null);

            return $event->slots()->create([
                ...$definition,
                'resource_type' => ResourceType::Person,
                'required_count' => $attributes['required_count'],
                'sort_order' => $attributes['sort_order'] ?? ($event->slots()->max('sort_order') ?? -1) + 1,
            ]);
        });
    }
}
