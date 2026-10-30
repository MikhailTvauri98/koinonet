<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Chat\ChatType;
use App\Modules\Chat\Events\ChatMetadataChanged;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

final readonly class ArchiveChat
{
    public function __construct(private AuditLogger $audit) {}

    public function handle(Chat $chat, ?User $actor): Chat
    {
        return DB::transaction(function () use ($chat, $actor): Chat {
            if ($actor !== null && in_array($chat->fresh()?->type, [ChatType::Ministry, ChatType::Event], true)) {
                throw DomainRuleException::because('chat.archived_with_parent', 'Чат архивируется вместе со служением или событием.');
            }
            $chat = $actor === null
                ? Chat::query()->lockForUpdate()->findOrFail($chat->id)
                : app(GroupChatGuard::class)->lock($actor, $chat, ability: 'archive');
            if ($chat->archived_at === null) {
                $chat->update(['archived_at' => now()]);
                $this->audit->recordForActor($actor, 'chat.archived', $chat);
                DB::afterCommit(fn () => ChatMetadataChanged::dispatch($chat->id));
            }

            return $chat;
        });
    }
}
