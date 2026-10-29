<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Policies;

use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Directory\Models\User;

final readonly class EventAssignmentPolicy
{
    public function __construct(private EventAccess $access) {}

    public function delete(User $user, EventAssignment $assignment): bool
    {
        return $assignment->archived_at === null && $this->access->canAssignSlot($user, $assignment->slot);
    }
}
