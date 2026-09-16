<?php

declare(strict_types=1);

namespace App\Modules\Access;

enum PermissionScope: string
{
    case Global = 'global';
    case Ministry = 'ministry';
}
