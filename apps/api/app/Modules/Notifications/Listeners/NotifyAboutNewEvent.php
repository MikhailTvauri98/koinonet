<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Listeners;

use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\Events\EventCreated;
use App\Modules\Calendar\Models\Event;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Notifications\EventAnnouncedNotification;
use App\Modules\Notifications\Recipients;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

final class NotifyAboutNewEvent implements ShouldQueue
{
    public function handle(EventCreated $event): void
    {
        if ($event->notify === 'none') {
            return;
        }
        $model = Event::query()->whereNull('archived_at')->find($event->eventId);
        if ($model === null) {
            return;
        }
        $recipients = app(Recipients::class);
        $accounts = match ($event->notify) {
            'all' => $recipients->allActive(),
            'ministry' => $model->ministry_id === null ? null : $recipients->ministryMembers($model->ministry_id),
            default => null,
        };
        $access = app(EventAccess::class);
        foreach ($accounts?->filter(fn (User $user): bool => $access->canView($user, $model))->chunk(200) ?? [] as $chunk) {
            Notification::send($chunk->all(), new EventAnnouncedNotification($model));
        }
    }
}
