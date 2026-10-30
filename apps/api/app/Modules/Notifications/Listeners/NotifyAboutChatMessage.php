<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Listeners;

use App\Modules\Chat\Events\MessageSent;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Notifications\ChatMessageNotification;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\Notification;

final class NotifyAboutChatMessage implements ShouldQueueAfterCommit
{
    public function handle(MessageSent $event): void
    {
        $chat = Chat::query()->find($event->chatId);
        $message = Message::query()->where('chat_id', $event->chatId)->find($event->messageId);
        if ($chat === null || $message === null || $message->isDeleted()) {
            return;
        }
        User::query()->whereNull('disabled_at')->where('id', '!=', $event->senderUserId)
            ->whereIn('id', ChatMember::query()->select('user_id')->where('chat_id', $chat->id)
                ->where(fn (Builder $query): Builder => $query->whereNull('muted_until')->orWhere('muted_until', '<=', now())))
            ->chunkById(200, function (Collection $users) use ($message, $chat): void {
                Notification::send($users, new ChatMessageNotification($message, $chat));
            });
    }
}
