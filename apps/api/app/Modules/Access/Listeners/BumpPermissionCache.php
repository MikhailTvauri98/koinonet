<?php

declare(strict_types=1);

namespace App\Modules\Access\Listeners;

use App\Modules\Access\Events\PersonRolesChanged;
use App\Modules\Access\Events\RoleDeleted;
use App\Modules\Access\PermissionCache;
use Illuminate\Contracts\Queue\ShouldQueue;

final readonly class BumpPermissionCache implements ShouldQueue
{
    public function __construct(private PermissionCache $cache) {}

    public function handle(PersonRolesChanged|RoleDeleted $event): void
    {
        if ($event instanceof PersonRolesChanged) {
            if ($event->userId !== null) {
                $this->cache->bump($event->userId);
            }

            return;
        }

        $this->cache->bump(...$event->carrierUserIds);
    }
}
