<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

enum EventVisibility: string
{
    case Church = 'church';
    case Ministry = 'ministry';
    case Assigned = 'assigned';
}
