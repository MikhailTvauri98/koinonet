<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Events;

use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final readonly class MemberAdded
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(
        public string $ministryId,
        public string $personId,
        public ?string $userId,
    ) {}
}
