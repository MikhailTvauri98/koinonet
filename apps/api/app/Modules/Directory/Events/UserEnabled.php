<?php

declare(strict_types=1);

namespace App\Modules\Directory\Events;

use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final readonly class UserEnabled
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public string $userId,
        public string $personId,
    ) {}
}
