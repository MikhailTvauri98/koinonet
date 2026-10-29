<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Actions;

use App\Modules\Directory\Models\User;

final class MarkNotificationsRead
{
    /** @param list<string>|null $ids */
    public function handle(User $user, ?array $ids, bool $all): int
    {
        $query = $user->unreadNotifications();

        if (! $all) {
            $query->whereIn('id', $ids ?? []);
        }

        $query->update(['read_at' => now()]);

        return $user->unreadNotifications()->count();
    }
}
