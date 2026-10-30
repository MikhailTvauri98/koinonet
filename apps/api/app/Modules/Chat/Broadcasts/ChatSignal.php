<?php

declare(strict_types=1);

namespace App\Modules\Chat\Broadcasts;

use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;

/** Shared channels carry references only: retained sockets must never receive content. */
abstract class ChatSignal implements ShouldBroadcast
{
    public function __construct(protected readonly string $chatId) {}

    public function broadcastOn(): PrivateChannel
    {
        return new PrivateChannel("chat.{$this->chatId}");
    }
}
