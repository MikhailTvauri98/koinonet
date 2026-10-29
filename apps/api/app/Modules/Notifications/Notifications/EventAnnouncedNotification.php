<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Notifications;

final class EventAnnouncedNotification extends EventNotification
{
    public function title(): string
    {
        return 'Новое событие';
    }
}
