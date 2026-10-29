<?php

declare(strict_types=1);

namespace App\Modules\Notifications;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\PushSubscription;

final readonly class PushGate
{
    public function __construct(private NotificationPreferences $preferences) {}

    public function allows(User $user, AppNotification $notification): bool
    {
        return $this->preferences->isEnabled($user, $notification->category())
            && PushSubscription::query()->where('user_id', $user->id)->exists();
    }
}
