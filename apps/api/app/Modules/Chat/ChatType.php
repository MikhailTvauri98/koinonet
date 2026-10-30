<?php

declare(strict_types=1);

namespace App\Modules\Chat;

enum ChatType: string
{
    case Ministry = 'ministry';
    case Event = 'event';
    case Group = 'group';
    case Direct = 'direct';
}
