<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Controllers;

use App\Modules\Chat\Actions\MarkChatRead;
use App\Modules\Chat\Http\Requests\MarkReadRequest;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\UnreadCounter;
use App\Modules\Directory\Models\User;

final class ChatReadController
{
    /** @return array{unread_count: int, unread_total: int} */
    public function __invoke(MarkReadRequest $request, Chat $chat, MarkChatRead $mark, UnreadCounter $counter): array
    {
        $user = $request->user();
        assert($user instanceof User);
        $mark->handle($user, $chat, $request->validated('message_id'));

        return ['unread_count' => $counter->forChat($user, $chat), 'unread_total' => $counter->total($user)];
    }
}
