<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Actions;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\NotificationSetting;
use Illuminate\Support\Facades\DB;

final class SetNotificationSettings
{
    /** @param array<string, bool> $settings */
    public function handle(User $user, array $settings): void
    {
        DB::transaction(function () use ($user, $settings): void {
            foreach ($settings as $category => $enabled) {
                NotificationSetting::query()->updateOrCreate(
                    ['user_id' => $user->id, 'category' => $category],
                    ['enabled' => $enabled],
                );
            }
        });
    }
}
