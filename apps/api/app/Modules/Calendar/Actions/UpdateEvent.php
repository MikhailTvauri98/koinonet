<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Events\EventChanged;
use App\Modules\Calendar\Models\Event;
use App\Support\DomainRuleException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

final class UpdateEvent
{
    /** @param array{title?: string, description?: string|null, location?: string|null, starts_at?: string, ends_at?: string, visibility?: string} $attributes */
    public function handle(Event $event, array $attributes): Event
    {
        // Laravel's prohibited rule tolerates empty values; only mutable columns reach the model.
        $attributes = Arr::only($attributes, ['title', 'description', 'location', 'starts_at', 'ends_at', 'visibility']);

        return DB::transaction(function () use ($event, $attributes): Event {
            $event = Event::query()->lockForUpdate()->findOrFail($event->id);
            if ($event->isCancelled() && (isset($attributes['starts_at']) || isset($attributes['ends_at']))) {
                throw DomainRuleException::because('event.cancelled', 'Время отменённого события изменить нельзя.');
            }
            foreach (['starts_at', 'ends_at'] as $field) {
                if (isset($attributes[$field])) {
                    $attributes[$field] = CarbonImmutable::parse($attributes[$field])->utc();
                }
            }
            $event->fill($attributes);
            $changed = array_values(array_filter(['starts_at', 'ends_at', 'location'], fn (string $field): bool => $event->isDirty($field)));
            $event->save();
            if ($changed !== []) {
                EventChanged::dispatch($event->id, $changed);
            }

            return $event;
        });
    }
}
