<?php

declare(strict_types=1);

namespace App\Modules\Notifications;

enum NotificationCategory: string
{
    case Announcements = 'announcements';
    case Chat = 'chat';
    case Assignments = 'assignments';
    case Reminders = 'reminders';

    public function label(): string
    {
        return match ($this) {
            self::Announcements => 'Объявления',
            self::Chat => 'Чаты',
            self::Assignments => 'Назначения',
            self::Reminders => 'Напоминания',
        };
    }
}
