<?php

declare(strict_types=1);

namespace App\Modules\Announcements;

enum AnnouncementScope: string
{
    case Church = 'church';
    case Ministry = 'ministry';
}
