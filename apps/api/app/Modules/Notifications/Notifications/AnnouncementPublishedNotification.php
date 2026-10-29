<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Notifications;

use App\Modules\Announcements\Models\Announcement;
use App\Modules\Notifications\AppNotification;
use App\Modules\Notifications\NotificationCategory;
use Illuminate\Support\Str;

final class AnnouncementPublishedNotification extends AppNotification
{
    public function __construct(private readonly Announcement $announcement) {}

    public function category(): NotificationCategory
    {
        return NotificationCategory::Announcements;
    }

    public function title(): string
    {
        return $this->announcement->title;
    }

    public function body(): string
    {
        $html = Str::markdown($this->announcement->body, ['html_input' => 'strip', 'allow_unsafe_links' => false]);
        $plain = html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8');

        return trim(preg_replace('/\s+/u', ' ', $plain) ?? '');
    }

    public function url(): string
    {
        return "/announcements/{$this->announcement->id}";
    }

    public function tag(): string
    {
        return "announcement-{$this->announcement->id}";
    }
}
