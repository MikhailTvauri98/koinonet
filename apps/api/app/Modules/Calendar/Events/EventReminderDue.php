<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Events;

use App\Modules\Calendar\ReminderKind;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

final class EventReminderDue implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $eventId, public readonly ReminderKind $kind) {}
}
