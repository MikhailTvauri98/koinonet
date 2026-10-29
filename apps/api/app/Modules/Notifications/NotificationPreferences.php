<?php

declare(strict_types=1);

namespace App\Modules\Notifications;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\NotificationSetting;

final class NotificationPreferences
{
    public function isEnabled(User $user, NotificationCategory $category): bool
    {
        $row = NotificationSetting::query()
            ->where('user_id', $user->id)
            ->where('category', $category->value)
            ->first();

        return $row === null || $row->enabled;
    }

    /** @return array<string, bool> */
    public function all(User $user): array
    {
        $stored = NotificationSetting::query()->where('user_id', $user->id)->pluck('enabled', 'category');
        $result = [];

        foreach (NotificationCategory::cases() as $category) {
            $result[$category->value] = (bool) ($stored[$category->value] ?? true);
        }

        return $result;
    }
}
