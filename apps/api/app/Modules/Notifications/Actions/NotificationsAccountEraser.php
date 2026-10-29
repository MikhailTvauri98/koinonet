<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Actions;

use App\Modules\Directory\Contracts\AccountEraser;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\NotificationSetting;
use Illuminate\Notifications\DatabaseNotification;

final readonly class NotificationsAccountEraser implements AccountEraser
{
    public function __construct(private RemoveAccountPushSubscriptions $removeSubscriptions) {}

    public function eraseAccount(string $userId): void
    {
        $this->removeSubscriptions->handle($userId);
        NotificationSetting::query()->where('user_id', $userId)->delete();
        DatabaseNotification::query()->where('notifiable_id', $userId)
            ->where('notifiable_type', (new User)->getMorphClass())->delete();
    }
}
