<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Events;

use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

final readonly class MinistryArchived
{
    use Dispatchable;
    use SerializesModels;

    public function __construct(public string $ministryId) {}
}
