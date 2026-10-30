<?php

declare(strict_types=1);

namespace App\Modules\Chat\Listeners;

use App\Modules\Chat\Actions\ArchiveChat;
use App\Modules\Chat\Models\Chat;
use App\Modules\Ministries\Events\MinistryArchived;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;

final readonly class ArchiveChatOnMinistryArchived implements ShouldQueueAfterCommit
{
    public function __construct(private ArchiveChat $archive) {}

    public function handle(MinistryArchived $event): void
    {
        $chat = Chat::query()->where('ministry_id', $event->ministryId)->first();
        if ($chat !== null && $chat->ministry?->archived_at !== null) {
            $this->archive->handle($chat, null);
        }
    }
}
