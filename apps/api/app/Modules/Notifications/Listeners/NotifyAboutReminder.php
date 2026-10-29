<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Listeners;

use App\Modules\Calendar\Events\EventReminderDue;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\Event;
use App\Modules\Notifications\Notifications\EventReminderNotification;
use App\Modules\Notifications\Recipients;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

final class NotifyAboutReminder implements ShouldQueue
{
    public function handle(EventReminderDue $event): void
    {
        $model = Event::query()->where('status', EventStatus::Scheduled)->whereNull('archived_at')->find($event->eventId);
        if ($model === null) {
            return;
        }
        foreach (app(Recipients::class)->assignedToEvent($model->id)->chunk(200) as $chunk) {
            Notification::send($chunk->all(), new EventReminderNotification($model, $event->kind));
        }
    }
}
