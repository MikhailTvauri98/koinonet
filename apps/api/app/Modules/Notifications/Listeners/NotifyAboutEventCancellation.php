<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Listeners;

use App\Modules\Calendar\Events\EventCancelled;
use App\Modules\Calendar\Models\Event;
use App\Modules\Notifications\Notifications\EventCancelledNotification;
use App\Modules\Notifications\Recipients;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

final class NotifyAboutEventCancellation implements ShouldQueue
{
    public function handle(EventCancelled $event): void
    {
        $model = Event::query()->whereNull('archived_at')->find($event->eventId);
        if ($model === null) {
            return;
        }
        foreach (app(Recipients::class)->assignedToEvent($model->id)->chunk(200) as $chunk) {
            Notification::send($chunk->all(), new EventCancelledNotification($model, $event->reason));
        }
    }
}
