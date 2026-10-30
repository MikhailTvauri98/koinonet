<?php

declare(strict_types=1);

namespace App\Modules\Chat;

use App\Modules\Chat\Models\Message;
use Illuminate\Database\Eloquent\Collection;

final readonly class PinnedMessages
{
    /** @return Collection<int, Message> */
    public function forChat(string $chatId): Collection
    {
        return Message::query()->select('messages.*')
            ->join('chat_pinned_messages as pins', 'pins.message_id', '=', 'messages.id')
            ->where('pins.chat_id', $chatId)->where('messages.chat_id', $chatId)->whereNull('messages.deleted_at')
            ->with(['sender.person.photo', 'replyTo.sender.person', 'attachments.media'])
            ->orderByDesc('pins.pinned_at')->orderByDesc('messages.id')->limit(20)->get();
    }
}
