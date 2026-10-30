<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Chat\Models\ChatPinnedMessage;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Contracts\AccountEraser;

final class ChatAccountEraser implements AccountEraser
{
    public function eraseAccount(string $userId): void
    {
        ChatMember::query()->where('user_id', $userId)->delete();
        Message::query()->where('sender_user_id', $userId)->update(['sender_user_id' => null]);
        Chat::query()->where('created_by_user_id', $userId)->update(['created_by_user_id' => null]);
        ChatPinnedMessage::query()->where('pinned_by_user_id', $userId)->update(['pinned_by_user_id' => null]);
    }
}
