<?php

declare(strict_types=1);

namespace App\Modules\Access;

use Illuminate\Support\Facades\Cache;

final class PermissionCache
{
    public function version(string $userId): int
    {
        return (int) Cache::get("perm-version:{$userId}", 1);
    }

    public function bump(string ...$userIds): void
    {
        foreach (array_unique($userIds) as $userId) {
            Cache::add("perm-version:{$userId}", 1);
            Cache::increment("perm-version:{$userId}");
        }
    }

    public function key(string $userId): string
    {
        return "perm:{$userId}:v{$this->version($userId)}";
    }
}
