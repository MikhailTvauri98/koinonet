<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\SlotAttributes;
use App\Support\DomainRuleException;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

final readonly class UpdateSlot
{
    public function __construct(private SlotAttributes $definition) {}

    /** @param array{label?: string|null, role_id?: string|null, required_count?: int} $attributes */
    public function handle(EventSlot $slot, array $attributes): EventSlot
    {
        return DB::transaction(function () use ($slot, $attributes): EventSlot {
            $event = Event::query()->lockForUpdate()->findOrFail($slot->event_id);
            $slot = EventSlot::query()->whereNull('archived_at')->lockForUpdate()->findOrFail($slot->id);
            if ($event->isCancelled()) {
                throw DomainRuleException::because('event.cancelled', 'Слоты отменённого события изменить нельзя.');
            }
            $attributes = Arr::only($attributes, ['label', 'role_id', 'required_count']);
            $merged = array_replace(['label' => $slot->label, 'role_id' => $slot->role_id], $attributes);
            $slot->fill([
                ...$attributes,
                ...$this->definition->resolve($merged['label'], $merged['role_id']),
            ])->save();

            return $slot;
        });
    }
}
