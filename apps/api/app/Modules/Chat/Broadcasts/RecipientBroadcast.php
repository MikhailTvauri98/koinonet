<?php

declare(strict_types=1);

namespace App\Modules\Chat\Broadcasts;

use App\Modules\Directory\Models\User;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;

abstract class RecipientBroadcast implements ShouldBroadcast
{
    public function __construct(protected readonly string $userId) {}

    protected function recipient(): ?User
    {
        $user = User::query()->find($this->userId);

        return $user !== null && ! $user->isDisabled() ? $user : null;
    }

    /** @return PrivateChannel|array{} */
    public function broadcastOn(): PrivateChannel|array
    {
        return $this->recipient() === null ? [] : new PrivateChannel("user.{$this->userId}");
    }
}
