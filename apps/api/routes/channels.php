<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('user.{userId}', function (User $user, string $userId): bool {
    return $user->id === $userId && ! $user->isDisabled();
});
