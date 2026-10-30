<?php

declare(strict_types=1);

namespace App\Modules\Chat;

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Calendar\EventAccess;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\User;

final readonly class ChatAccess
{
    public function __construct(private PermissionResolver $permissions, private EventAccess $events) {}

    public function canRead(User $user, Chat $chat): bool
    {
        return ! $user->isDisabled() && ($this->isMember($user, $chat)
            || ($chat->type === ChatType::Ministry && $this->permissions->can($user, Permission::MinistriesViewAll)));
    }

    public function canWrite(User $user, Chat $chat): bool
    {
        return ! $user->isDisabled() && $chat->archived_at === null && $this->isMember($user, $chat);
    }

    public function canModerate(User $user, Chat $chat): bool
    {
        if ($user->isDisabled() || $chat->archived_at !== null) {
            return false;
        }

        // Ministry and global moderation permissions enter the catalogue in task 5.
        return match ($chat->type) {
            ChatType::Group => $this->isOwner($user, $chat),
            ChatType::Event => $chat->event !== null && $this->events->canManage($user, $chat->event),
            default => false,
        };
    }

    public function canManageMembers(User $user, Chat $chat): bool
    {
        return ! $user->isDisabled() && $chat->archived_at === null
            && $chat->type === ChatType::Group && $this->isOwner($user, $chat);
    }

    public function member(User $user, Chat $chat): ?ChatMember
    {
        return $chat->relationLoaded('members')
            ? $chat->members->firstWhere('user_id', $user->id)
            : $chat->members()->where('user_id', $user->id)->first();
    }

    private function isMember(User $user, Chat $chat): bool
    {
        return $this->member($user, $chat) !== null;
    }

    private function isOwner(User $user, Chat $chat): bool
    {
        return $this->member($user, $chat)?->is_owner === true;
    }
}
