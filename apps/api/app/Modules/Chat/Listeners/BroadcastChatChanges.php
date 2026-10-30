<?php

declare(strict_types=1);

namespace App\Modules\Chat\Listeners;

use App\Modules\Chat\Broadcasts\ChatMembersChangedBroadcast;
use App\Modules\Chat\Broadcasts\ChatPinnedBroadcast;
use App\Modules\Chat\Broadcasts\ChatUpdatedBroadcast;
use App\Modules\Chat\Broadcasts\MessageDeletedBroadcast;
use App\Modules\Chat\Broadcasts\MessageEditedBroadcast;
use App\Modules\Chat\Broadcasts\MessageSentBroadcast;
use App\Modules\Chat\Broadcasts\UnreadTotalBroadcast;
use App\Modules\Chat\Events\ChatMembersChanged;
use App\Modules\Chat\Events\ChatMetadataChanged;
use App\Modules\Chat\Events\ChatPinsChanged;
use App\Modules\Chat\Events\ChatRead;
use App\Modules\Chat\Events\MessageDeleted;
use App\Modules\Chat\Events\MessageEdited;
use App\Modules\Chat\Events\MessageSent;
use App\Modules\Chat\Models\Chat;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;

final class BroadcastChatChanges implements ShouldQueueAfterCommit
{
    public function handle(MessageSent|MessageEdited|MessageDeleted|ChatPinsChanged|ChatMembersChanged|ChatRead|ChatMetadataChanged $event): void
    {
        if ($event instanceof ChatRead) {
            $this->personal($event->chatId, $event->userId);

            return;
        }
        if ($event instanceof ChatMetadataChanged) {
            foreach (Chat::query()->find($event->chatId)?->members()->pluck('user_id')->all() ?? [] as $userId) {
                $this->personal($event->chatId, $userId);
            }

            return;
        }
        $signal = match (true) {
            $event instanceof MessageSent => new MessageSentBroadcast($event->chatId, $event->messageId),
            $event instanceof MessageEdited => new MessageEditedBroadcast($event->chatId, $event->messageId),
            $event instanceof MessageDeleted => new MessageDeletedBroadcast($event->chatId, $event->messageId),
            $event instanceof ChatPinsChanged => new ChatPinnedBroadcast($event->chatId),
            $event instanceof ChatMembersChanged => new ChatMembersChangedBroadcast($event->chatId, $event->added, $event->removed),
        };
        event($signal);
        $members = Chat::query()->find($event->chatId)?->members()->pluck('user_id')->all() ?? [];
        if ($event instanceof ChatMembersChanged) {
            $members = array_unique([...$members, ...$event->added, ...$event->removed]);
        }
        foreach ($members as $userId) {
            $this->personal($event->chatId, $userId);
        }
    }

    private function personal(string $chatId, string $userId): void
    {
        event(new ChatUpdatedBroadcast($chatId, $userId));
        event(new UnreadTotalBroadcast($userId));
    }
}
