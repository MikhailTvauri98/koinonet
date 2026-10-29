<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Listeners;

use App\Modules\Calendar\Events\EventChanged;
use App\Modules\Calendar\Models\Event;
use App\Modules\Notifications\Notifications\EventChangedNotification;
use App\Modules\Notifications\Recipients;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

final class NotifyAboutEventChange implements ShouldQueue
{
    public function handle(EventChanged $event): void
    {
        $model = Event::query()->whereNull('archived_at')->find($event->eventId);
        if ($model === null || array_intersect($event->changed, ['starts_at', 'ends_at', 'location']) === []) {
            return;
        }
        foreach (app(Recipients::class)->assignedToEvent($model->id)->chunk(200) as $chunk) {
            Notification::send($chunk->all(), new EventChangedNotification($model, $event->changed));
        }
    }
}
