<?php

declare(strict_types=1);

namespace App\Modules\Directory;

enum PersonStatus: string
{
    case Member = 'member';
    case Attendee = 'attendee';
    case Guest = 'guest';
}
