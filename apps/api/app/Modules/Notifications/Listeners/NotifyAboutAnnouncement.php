<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Listeners;

use App\Modules\Announcements\AnnouncementScope;
use App\Modules\Announcements\Events\AnnouncementPublished;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Notifications\Notifications\AnnouncementPublishedNotification;
use App\Modules\Notifications\Recipients;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Support\Facades\Notification;

final class NotifyAboutAnnouncement implements ShouldQueue
{
    public function handle(AnnouncementPublished $event): void
    {
        $announcement = Announcement::query()->find($event->announcementId);

        if ($announcement === null || ! $announcement->notify_on_publish || $announcement->archived_at !== null) {
            return;
        }

        $recipients = app(Recipients::class);
        if ($announcement->scope === AnnouncementScope::Church) {
            $accounts = $recipients->allActive();
        } else {
            assert($announcement->ministry_id !== null);
            $accounts = $recipients->ministryMembers($announcement->ministry_id);
        }

        foreach ($accounts->chunk(200) as $chunk) {
            Notification::send($chunk->all(), new AnnouncementPublishedNotification($announcement));
        }
    }
}
