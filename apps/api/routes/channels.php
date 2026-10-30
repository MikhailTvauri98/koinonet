<?php

declare(strict_types=1);

use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('user.{userId}', function (User $user, string $userId): bool {
    return $user->id === $userId && ! $user->isDisabled();
});

Broadcast::channel('chat.{chatId}', function (User $user, string $chatId): bool {
    $chat = Chat::query()->find($chatId);

    return $chat !== null && app(ChatAccess::class)->canRead($user, $chat);
});
