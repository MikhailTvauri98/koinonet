<?php

declare(strict_types=1);

namespace App\Modules\Chat\Broadcasts;

use App\Modules\Chat\ChatType;
use App\Modules\Chat\Http\Resources\ChatListItemResource;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\UnreadCounter;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Http\Request;

final class ChatUpdatedBroadcast extends RecipientBroadcast
{
    public function __construct(private readonly string $chatId, string $userId)
    {
        parent::__construct($userId);
    }

    public function broadcastAs(): string
    {
        return 'chat.updated';
    }

    /** @return PrivateChannel|array{} */
    public function broadcastOn(): PrivateChannel|array
    {
        $chat = Chat::query()->find($this->chatId);
        if ($chat !== null && $chat->type === ChatType::Direct && ! $chat->messages()->exists()) {
            return [];
        }

        return parent::broadcastOn();
    }

    /** @return array<string, mixed> */
    public function broadcastWith(): array
    {
        $user = $this->recipient();
        $chat = Chat::query()->with(['ministry', 'event', 'avatar', 'members.user.person.photo', 'lastMessage'])->find($this->chatId);
        if ($user === null || $chat === null || ! $chat->members->contains('user_id', $this->userId)) {
            return ['chat' => ['id' => $this->chatId], 'removed' => true];
        }
        $request = Request::create('/');
        $request->setUserResolver(fn () => $user);

        return ['chat' => (new ChatListItemResource($chat, app(UnreadCounter::class)->forChat($user, $chat)))->resolve($request)];
    }
}
