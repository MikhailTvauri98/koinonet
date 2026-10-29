<?php

declare(strict_types=1);

namespace App\Modules\Notifications;

use App\Modules\Calendar\Models\Event;
use App\Modules\Settings\ChurchSettings;

final class EventText
{
    public static function when(Event $event): string
    {
        return $event->starts_at->setTimezone(app(ChurchSettings::class)->timezone())->locale('ru')->isoFormat('D MMM, HH:mm');
    }
}
