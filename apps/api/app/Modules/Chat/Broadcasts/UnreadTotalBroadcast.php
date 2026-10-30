<?php

declare(strict_types=1);

namespace App\Modules\Chat\Broadcasts;

use App\Modules\Chat\UnreadCounter;

final class UnreadTotalBroadcast extends RecipientBroadcast
{
    public function broadcastAs(): string
    {
        return 'unread.total';
    }

    /** @return array{total: int} */
    public function broadcastWith(): array
    {
        $user = $this->recipient();

        return ['total' => $user === null ? 0 : app(UnreadCounter::class)->total($user)];
    }
}
