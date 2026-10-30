<?php

declare(strict_types=1);

namespace App\Modules\Chat\Broadcasts;

final class ChatPinnedBroadcast extends ChatSignal
{
    public function broadcastAs(): string
    {
        return 'chat.pinned';
    }

    /** @return array{chat_id: string} */
    public function broadcastWith(): array
    {
        return ['chat_id' => $this->chatId];
    }
}
