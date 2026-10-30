<?php

declare(strict_types=1);

namespace App\Modules\Chat\Broadcasts;

final class ChatMembersChangedBroadcast extends ChatSignal
{
    /** @param list<string> $added
     * @param list<string> $removed */
    public function __construct(string $chatId, private readonly array $added, private readonly array $removed)
    {
        parent::__construct($chatId);
    }

    public function broadcastAs(): string
    {
        return 'chat.members_changed';
    }

    /** @return array{added: list<string>, removed: list<string>} */
    public function broadcastWith(): array
    {
        return ['added' => $this->added, 'removed' => $this->removed];
    }
}
