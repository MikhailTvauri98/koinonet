<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Modules\Notifications\AppNotification;
use App\Modules\Notifications\NotificationCategory;

class PushSample extends AppNotification
{
    public function category(): NotificationCategory
    {
        return NotificationCategory::Announcements;
    }

    public function title(): string
    {
        return 'Собрание';
    }

    public function body(): string
    {
        return 'В воскресенье в 10:00';
    }

    public function url(): string
    {
        return '/announcements/a1';
    }

    public function tag(): string
    {
        return 'announcement-a1';
    }
}
