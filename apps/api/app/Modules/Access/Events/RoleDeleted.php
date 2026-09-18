<?php

declare(strict_types=1);

namespace App\Modules\Access\Events;

use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final readonly class RoleDeleted
{
    use Dispatchable;
    use SerializesModels;

    /** @param list<string> $carrierUserIds */
    public function __construct(
        public string $roleId,
        public array $carrierUserIds,
    ) {}
}
