<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Notifications;

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\ReminderKind;
use App\Modules\Notifications\NotificationCategory;

final class EventReminderNotification extends EventNotification
{
    public function __construct(Event $event, private readonly ReminderKind $kind)
    {
        parent::__construct($event);
    }

    public function category(): NotificationCategory
    {
        return NotificationCategory::Reminders;
    }

    public function title(): string
    {
        return 'Напоминание: '.$this->kind->label();
    }

    public function body(): string
    {
        return parent::body().($this->event->location === null || $this->event->location === '' ? '' : ', '.$this->event->location);
    }

    public function tag(): string
    {
        return parent::tag().'-reminder';
    }
}
