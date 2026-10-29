<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Actions;

use App\Modules\Announcements\Models\Announcement;
use App\Modules\Announcements\Models\AnnouncementView;
use App\Modules\Directory\Contracts\AccountEraser;

final class AnnouncementsAccountEraser implements AccountEraser
{
    public function eraseAccount(string $userId): void
    {
        Announcement::query()->where('author_user_id', $userId)->update(['author_user_id' => null]);
        AnnouncementView::query()->where('user_id', $userId)->delete();
    }
}
