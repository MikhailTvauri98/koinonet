<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Push;

use App\Modules\Notifications\Models\PushSubscription;

interface PushTransport
{
    public function push(PushSubscription $subscription, string $payload): PushResult;
}
