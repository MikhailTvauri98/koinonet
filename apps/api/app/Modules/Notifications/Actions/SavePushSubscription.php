<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Actions;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\PushSubscription;

final readonly class SavePushSubscription
{
    public function handle(User $user, string $endpoint, string $p256dh, string $auth, string $encoding, ?string $userAgent): PushSubscription
    {
        return PushSubscription::query()->updateOrCreate(['endpoint' => $endpoint], [
            'user_id' => $user->id,
            'public_key' => $p256dh,
            'auth_token' => $auth,
            'content_encoding' => $encoding,
            'user_agent' => $userAgent === null ? null : mb_substr($userAgent, 0, 255),
            'failures' => 0,
            'last_success_at' => null,
        ]);
    }
}
