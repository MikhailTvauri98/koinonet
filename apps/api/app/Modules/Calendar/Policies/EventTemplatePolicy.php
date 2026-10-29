<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Policies;

use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Directory\Models\User;

final readonly class EventTemplatePolicy
{
    public function __construct(private EventAccess $access) {}

    public function create(User $user, EventOwnerType $owner, ?string $ministryId): bool
    {
        return $this->access->canManageOwner($user, $owner, $ministryId);
    }

    public function view(User $user, EventTemplate $template): bool
    {
        return $this->access->canViewTemplate($user, $template);
    }

    public function update(User $user, EventTemplate $template): bool
    {
        return $this->access->canManageTemplate($user, $template);
    }
}
