<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Controllers;

use App\Modules\Chat\Actions\ArchiveChat;
use App\Modules\Chat\Actions\CreateGroupChat;
use App\Modules\Chat\Actions\OpenDirectChat;
use App\Modules\Chat\Actions\UpdateGroupChat;
use App\Modules\Chat\ChatType;
use App\Modules\Chat\Http\Requests\ChatAvatarRequest;
use App\Modules\Chat\Http\Requests\CreateChatRequest;
use App\Modules\Chat\Http\Requests\UpdateChatRequest;
use App\Modules\Chat\Http\Resources\ChatListItemResource;
use App\Modules\Chat\Http\Resources\ChatResource;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\UnreadCounter;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use Dedoc\Scramble\Attributes\Response as OpenApiResponse;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

final class ChatController
{
    #[OpenApiResponse(status: 200, type: 'array{data: ChatResource}')]
    #[OpenApiResponse(status: 201, type: 'array{data: ChatResource}')]
    public function store(CreateChatRequest $request, CreateGroupChat $action, OpenDirectChat $direct): JsonResponse
    {
        $actor = $request->user();
        assert($actor instanceof User);
        if ($request->validated('type') === 'direct') {
            $result = $direct->handle($actor, User::query()->findOrFail($request->validated('user_id')));

            return $this->resource($result['chat'], $actor)->response()->setStatusCode($result['created'] ? 201 : 200);
        }
        /** @var list<string> $ids */
        $ids = $request->validated('member_ids');
        $chat = $action->handle($actor, (string) $request->validated('title'), $ids);

        return (new ChatResource($chat))->response()->setStatusCode(201);
    }

    public function update(UpdateChatRequest $request, Chat $chat, UpdateGroupChat $action): ChatResource
    {
        $actor = $request->user();
        assert($actor instanceof User);

        return $this->resource($action->handle($actor, $chat, (string) $request->validated('title')), $actor);
    }

    public function avatar(ChatAvatarRequest $request, Chat $chat, UpdateGroupChat $action): ChatResource
    {
        $actor = $request->user();
        assert($actor instanceof User);
        $media = Media::query()->findOrFail($request->validated('media_id'));

        return $this->resource($action->handle($actor, $chat, avatar: $media), $actor);
    }

    public function archive(Request $request, Chat $chat, ArchiveChat $action): ChatResource
    {
        $actor = $request->user();
        assert($actor instanceof User);

        return $this->resource($action->handle($chat, $actor), $actor);
    }

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

    private function resource(Chat $chat, User $actor): ChatResource
    {
        return new ChatResource($chat, app(UnreadCounter::class)->forChat($actor, $chat));
    }
}
