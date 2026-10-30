<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Resources;

use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\PinnedMessages;
use App\Modules\Directory\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/** @mixin Chat */
final class ChatResource extends ChatListItemResource
{
    /** @return array{id: string, type: string, title: string, avatar_url: string|null, ministry_id: string|null, event_id: string|null, archived: bool, last_message_at: string|null, last_message: array{id: string, body_preview: string, created_at: string, deleted: bool}|null, unread_count: int, muted_until: string|null, is_owner: bool, members: AnonymousResourceCollection, pinned_messages: AnonymousResourceCollection, can_write: bool, can_moderate: bool, can_manage_members: bool} */
    public function toArray(Request $request): array
    {
        $chat = $this->resource;
        assert($chat instanceof Chat);
        $user = $request->user();
        assert($user instanceof User);
        $access = app(ChatAccess::class);

        return [...parent::toArray($request),
            'members' => ChatMemberResource::collection($chat->members),
            'pinned_messages' => MessageResource::collection($access->canRead($user, $chat) ? app(PinnedMessages::class)->forChat($chat->id) : collect()),
            'can_write' => (bool) $access->canWrite($user, $chat),
            'can_moderate' => (bool) $access->canModerate($user, $chat),
            'can_manage_members' => (bool) $access->canManageMembers($user, $chat),
        ];
    }
}
