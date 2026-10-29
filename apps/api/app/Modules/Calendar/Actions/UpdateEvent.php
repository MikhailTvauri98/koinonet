<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Events\EventChanged;
use App\Modules\Calendar\Models\Event;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Actions\SyncAttachments;
use App\Support\DomainRuleException;
use Carbon\CarbonImmutable;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

final readonly class UpdateEvent
{
    public function __construct(private SyncAttachments $attachments) {}

    /** @param array{title?: string, description?: string|null, location?: string|null, starts_at?: string, ends_at?: string, visibility?: string, media_ids?: list<string>} $attributes */
    public function handle(Event $event, array $attributes, User $editor): Event
    {
        return DB::transaction(function () use ($event, $attributes, $editor): Event {
            $event = Event::query()->lockForUpdate()->findOrFail($event->id);
            // Only mutable columns reach the model; media_ids is handled by Media.
            $updates = Arr::only($attributes, ['title', 'description', 'location', 'starts_at', 'ends_at', 'visibility']);
            if ($event->isCancelled() && (isset($attributes['starts_at']) || isset($attributes['ends_at']))) {
                throw DomainRuleException::because('event.cancelled', 'Время отменённого события изменить нельзя.');
            }
            foreach (['starts_at', 'ends_at'] as $field) {
                if (isset($attributes[$field])) {
                    $updates[$field] = CarbonImmutable::parse($attributes[$field])->utc();
                }
            }
            $event->fill($updates);
            $changed = array_values(array_filter(['starts_at', 'ends_at', 'location'], fn (string $field): bool => $event->isDirty($field)));
            $event->save();
            if (array_key_exists('media_ids', $attributes)) {
                $this->attachments->handle($event, $attributes['media_ids'], $editor);
            }
            if ($changed !== []) {
                EventChanged::dispatch($event->id, $changed);
            }

            return $event;
        });
    }
}
