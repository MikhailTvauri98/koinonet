<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

use App\Modules\Directory\Models\Person;

final readonly class SlotCandidate
{
    /** @param list<array{event_id: string|null, title: string, starts_at: string|null, ends_at: string|null}> $conflicts */
    public function __construct(public Person $person, public bool $hasRole, public array $conflicts) {}
}
