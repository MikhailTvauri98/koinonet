<?php

declare(strict_types=1);

namespace App\Modules\Access\Events;

use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final readonly class PersonRolesChanged
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public string $personId,
        public ?string $userId,
    ) {}
}
