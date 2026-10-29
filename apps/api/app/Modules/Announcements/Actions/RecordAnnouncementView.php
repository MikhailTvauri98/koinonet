<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Actions;

use App\Modules\Announcements\Models\Announcement;
use App\Modules\Announcements\Models\AnnouncementView;
use App\Modules\Directory\Models\User;

final class RecordAnnouncementView
{
    public function handle(Announcement $announcement, User $viewer): void
    {
        AnnouncementView::query()->insertOrIgnore([
            'announcement_id' => $announcement->id,
            'user_id' => $viewer->id,
            'viewed_at' => now(),
        ]);
    }
}
