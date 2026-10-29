<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

final class AnnouncementPublished implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $announcementId) {}
}
