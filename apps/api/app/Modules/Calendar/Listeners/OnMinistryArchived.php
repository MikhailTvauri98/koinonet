<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Listeners;

use App\Modules\Calendar\Actions\ArchiveMinistryCalendar;
use App\Modules\Ministries\Events\MinistryArchived;
use Illuminate\Contracts\Queue\ShouldQueue;

final class OnMinistryArchived implements ShouldQueue
{
    public function handle(MinistryArchived $event): void
    {
        app(ArchiveMinistryCalendar::class)->handle($event->ministryId);
    }
}
