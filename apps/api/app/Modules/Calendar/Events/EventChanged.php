<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

final class EventChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /** @param list<string> $changed */
    public function __construct(public readonly string $eventId, public readonly array $changed) {}
}
