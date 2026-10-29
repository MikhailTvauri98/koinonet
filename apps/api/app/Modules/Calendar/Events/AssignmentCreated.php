<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

final class AssignmentCreated implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $eventId,
        public readonly string $slotId,
        public readonly string $personId,
        public readonly ?string $userId,
        public readonly ?string $actorUserId,
    ) {}
}
