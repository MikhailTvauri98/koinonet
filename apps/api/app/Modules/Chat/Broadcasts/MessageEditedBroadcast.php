<?php

declare(strict_types=1);

namespace App\Modules\Chat\Broadcasts;

final class MessageEditedBroadcast extends ChatSignal
{
    public function __construct(string $chatId, private readonly string $messageId)
    {
        parent::__construct($chatId);
    }

    public function broadcastAs(): string
    {
        return 'message.edited';
    }

    /** @return array{message_id: string} */
    public function broadcastWith(): array
    {
        return ['message_id' => $this->messageId];
    }
}
