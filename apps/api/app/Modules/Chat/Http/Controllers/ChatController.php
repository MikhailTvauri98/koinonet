<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Controllers;

use App\Modules\Chat\ChatType;
use App\Modules\Chat\Http\Resources\ChatListItemResource;
use App\Modules\Chat\Http\Resources\ChatResource;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\UnreadCounter;
use App\Modules\Directory\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

final class ChatController
{
    public function index(Request $request, UnreadCounter $unread): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Chat::class);
        $user = $request->user();
        assert($user instanceof User);
        $chats = Chat::query()->whereHas('members', fn (Builder $members): Builder => $members->where('user_id', $user->id))
            ->where(fn (Builder $query): Builder => $query->where('type', '!=', ChatType::Direct)->orWhereHas('messages'))
            ->with(['ministry', 'event', 'avatar', 'members.user.person.photo', 'lastMessage'])
            ->orderByRaw('last_message_at DESC NULLS LAST')->orderByDesc('id')->get();
        $counts = $unread->forChats($user, $chats);

        return ChatListItemResource::collection($chats->map(fn (Chat $chat): ChatListItemResource => new ChatListItemResource($chat, $counts[$chat->id])));
    }

    public function show(Request $request, Chat $chat, UnreadCounter $unread): ChatResource
    {
        Gate::authorize('view', $chat);
        $user = $request->user();
        assert($user instanceof User);
        $chat->load(['ministry', 'event', 'avatar', 'members.user.person.photo', 'lastMessage']);

        return new ChatResource($chat, $unread->forChat($user, $chat));
    }
}
