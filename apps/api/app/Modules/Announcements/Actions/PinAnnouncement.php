<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Actions;

use App\Modules\Announcements\Models\Announcement;

final class PinAnnouncement
{
    public function handle(Announcement $announcement): Announcement
    {
        $announcement->ensureNotArchived();
        if ($announcement->pinned_at === null) {
            $announcement->forceFill(['pinned_at' => now()])->save();
        }

        return $announcement;
    }
}
