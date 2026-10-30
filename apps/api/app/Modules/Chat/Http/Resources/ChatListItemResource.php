<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Resources;

use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\ChatType;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Media\SignedMediaUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin Chat */
class ChatListItemResource extends JsonResource
{
    public function __construct(Chat $resource, private readonly int $unreadCount = 0)
    {
        parent::__construct($resource);
    }

    /** @return array{id: string, type: string, title: string, avatar_url: string|null, ministry_id: string|null, event_id: string|null, archived: bool, last_message_at: string|null, last_message: array{id: string, body_preview: string, created_at: string, deleted: bool}|null, unread_count: int, muted_until: string|null, is_owner: bool} */
    public function toArray(Request $request): array
    {
        $chat = $this->resource;
        assert($chat instanceof Chat);
        $viewer = $request->user();
        assert($viewer instanceof User);
        $member = app(ChatAccess::class)->member($viewer, $chat);
        $partner = $chat->type === ChatType::Direct ? $this->visiblePartner($viewer, $chat) : null;
        $message = $chat->lastMessage;

        return [
            'id' => $chat->id,
            'type' => $chat->type->value,
            'title' => match ($chat->type) {
                ChatType::Ministry => $chat->ministry->name ?? '',
                ChatType::Event => $chat->event->title ?? '',
                ChatType::Group => $chat->title ?? '',
                ChatType::Direct => $partner?->fullName() ?? 'Личный чат',
            },
            'avatar_url' => $chat->type === ChatType::Direct
                ? SignedMediaUrl::variant($partner?->photo, 'thumb')
                : SignedMediaUrl::variant($chat->avatar, 'thumb'),
            'ministry_id' => $chat->ministry_id,
            'event_id' => $chat->event_id,
            'archived' => $chat->archived_at !== null,
            'last_message_at' => $chat->last_message_at?->toISOString(),
            'last_message' => $message === null ? null : [
                'id' => $message->id,
                'body_preview' => $message->isDeleted() ? 'Сообщение удалено' : mb_substr($message->body ?? '', 0, 150),
                /** @format date-time */
                'created_at' => (string) $message->created_at->toISOString(),
                'deleted' => $message->isDeleted(),
            ],
            'unread_count' => (int) $this->unreadCount,
            'muted_until' => $member?->muted_until?->toISOString(),
            'is_owner' => (bool) ($member->is_owner ?? false),
        ];
    }

    private function visiblePartner(User $viewer, Chat $chat): ?Person
    {
        $partner = $chat->members->first(fn (ChatMember $member): bool => $member->user_id !== $viewer->id)?->user->person;

        return $partner !== null && Gate::forUser($viewer)->allows('view', $partner) ? $partner : null;
    }
}
