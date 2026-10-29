<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Notifications;

use App\Modules\Calendar\Models\Event;
use App\Modules\Notifications\AppNotification;
use App\Modules\Notifications\EventText;
use App\Modules\Notifications\NotificationCategory;

abstract class EventNotification extends AppNotification
{
    public function __construct(protected readonly Event $event) {}

    public function category(): NotificationCategory
    {
        return NotificationCategory::Assignments;
    }

    public function body(): string
    {
        return $this->event->title.', '.EventText::when($this->event);
    }

    public function url(): string
    {
        return "/events/{$this->event->id}";
    }

    public function tag(): string
    {
        return "event-{$this->event->id}";
    }
}
