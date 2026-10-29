<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Directory\Contracts\AccountEraser;

final class CalendarAccountEraser implements AccountEraser
{
    public function eraseAccount(string $userId): void
    {
        Event::query()->where('created_by_user_id', $userId)->update(['created_by_user_id' => null]);
        EventTemplate::query()->where('created_by_user_id', $userId)->update(['created_by_user_id' => null]);
        EventAssignment::query()->where('assigned_by_user_id', $userId)->update(['assigned_by_user_id' => null]);
    }
}
