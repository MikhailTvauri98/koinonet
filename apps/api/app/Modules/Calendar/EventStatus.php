<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

enum EventStatus: string
{
    case Scheduled = 'scheduled';
    case Cancelled = 'cancelled';
}
