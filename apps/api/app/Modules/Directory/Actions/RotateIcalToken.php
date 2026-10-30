<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Directory\Models\User;
use Illuminate\Support\Str;

final class RotateIcalToken
{
    public function handle(User $user): User
    {
        $user->forceFill(['ical_token' => Str::random(64)])->save();

        return $user;
    }
}
