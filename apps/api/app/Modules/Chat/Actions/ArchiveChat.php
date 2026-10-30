<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Support\Facades\DB;

final readonly class ArchiveChat
{
    public function __construct(private AuditLogger $audit) {}

    public function handle(Chat $chat, ?User $actor): Chat
    {
        return DB::transaction(function () use ($chat, $actor): Chat {
            $chat = Chat::query()->lockForUpdate()->findOrFail($chat->id);
            if ($chat->archived_at === null) {
                $chat->update(['archived_at' => now()]);
                $this->audit->recordForActor($actor, 'chat.archived', $chat);
            }

            return $chat;
        });
    }
}
