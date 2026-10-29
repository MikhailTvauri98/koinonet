<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

enum EventOwnerType: string
{
    case Church = 'church';
    case Ministry = 'ministry';
}
