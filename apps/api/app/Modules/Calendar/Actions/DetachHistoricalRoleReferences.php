<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Access\Contracts\RoleReferenceDetacher;
use App\Modules\Access\Models\Role;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\Models\EventTemplateSlot;
use Illuminate\Database\Eloquent\Builder;

final class DetachHistoricalRoleReferences implements RoleReferenceDetacher
{
    public function handle(Role $role): void
    {
        EventSlot::query()->where('role_id', $role->id)
            ->where(fn (Builder $slots) => $slots->whereNotNull('archived_at')
                ->orWhereHas('event', fn (Builder $events) => $events->whereNotNull('archived_at')
                    ->orWhere('status', EventStatus::Cancelled)->orWhere('ends_at', '<=', now())))
            ->update(['role_id' => null]);

        EventTemplateSlot::query()->where('role_id', $role->id)
            ->where(fn (Builder $slots) => $slots->whereNotNull('archived_at')
                ->orWhereHas('template', fn (Builder $templates) => $templates->whereNotNull('archived_at')->orWhere('active', false)))
            ->update(['role_id' => null]);
    }
}
