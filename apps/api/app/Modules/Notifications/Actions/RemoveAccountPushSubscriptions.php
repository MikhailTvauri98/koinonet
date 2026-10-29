<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Actions;

use App\Modules\Notifications\Models\PushSubscription;

final readonly class RemoveAccountPushSubscriptions
{
    public function handle(string $userId): void
    {
        PushSubscription::query()->where('user_id', $userId)->delete();
    }
}
