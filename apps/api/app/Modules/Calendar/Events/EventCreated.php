<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

final class EventCreated implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $eventId, public readonly string $notify) {}
}
