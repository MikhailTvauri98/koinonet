<?php

declare(strict_types=1);

namespace App\Modules\Directory;

enum AccessLinkKind: string
{
    case Invite = 'invite';
    case PasswordReset = 'password_reset';
}
