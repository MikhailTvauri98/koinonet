<?php

declare(strict_types=1);

namespace App\Modules\Chat\Listeners;

use App\Modules\Chat\Actions\CreateMinistryChat;
use App\Modules\Ministries\Events\MinistryCreated;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;

final readonly class CreateMinistryChatOnCreated implements ShouldQueueAfterCommit
{
    public function __construct(private CreateMinistryChat $create) {}

    public function handle(MinistryCreated $event): void
    {
        $ministry = Ministry::query()->whereNull('archived_at')->find($event->ministryId);
        if ($ministry !== null) {
            $this->create->handle($ministry);
        }
    }
}
