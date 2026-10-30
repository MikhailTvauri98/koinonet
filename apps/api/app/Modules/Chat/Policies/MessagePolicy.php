<?php

declare(strict_types=1);

namespace App\Modules\Chat\Policies;

use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;

final readonly class MessagePolicy
{
    public function __construct(private ChatAccess $access) {}

    public function update(User $user, Message $message): bool
    {
        return $message->sender_user_id === $user->id && $this->access->canWrite($user, $message->chat);
    }

    public function delete(User $user, Message $message): bool
    {
        return $this->update($user, $message) || $this->access->canModerate($user, $message->chat);
    }

    public function create(User $user, Chat $chat): bool
    {
        return $this->access->canWrite($user, $chat);
    }

    public function pin(User $user, Message $message): bool
    {
        return $this->access->canModerate($user, $message->chat);
    }
}
