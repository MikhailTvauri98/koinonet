<?php

declare(strict_types=1);

namespace App\Modules\Chat\Broadcasts;

final class MessageSentBroadcast extends ChatSignal
{
    public function __construct(string $chatId, private readonly string $messageId)
    {
        parent::__construct($chatId);
    }

    public function broadcastAs(): string
    {
        return 'message.sent';
    }

    /** @return array{message_id: string} */
    public function broadcastWith(): array
    {
        return ['message_id' => $this->messageId];
    }
}
