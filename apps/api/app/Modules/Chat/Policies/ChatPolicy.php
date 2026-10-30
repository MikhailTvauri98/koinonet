<?php

declare(strict_types=1);

namespace App\Modules\Chat\Policies;

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;

final readonly class ChatPolicy
{
    public function __construct(private ChatAccess $access) {}

    public function create(User $user): bool
    {
        return ! $user->isDisabled() && app(PermissionResolver::class)->can($user, Permission::ChatsCreateGroups);
    }

    public function update(User $user, Chat $chat): bool
    {
        return $this->access->canManageGroup($user, $chat);
    }

    public function archive(User $user, Chat $chat): bool
    {
        return $this->update($user, $chat);
    }

    public function leave(User $user, Chat $chat): bool
    {
        return ! $user->isDisabled() && $this->access->member($user, $chat) !== null;
    }

    public function viewAny(User $user): bool
    {
        return ! $user->isDisabled();
    }

    public function view(User $user, Chat $chat): bool
    {
        return $this->access->canRead($user, $chat);
    }

    public function mute(User $user, Chat $chat): bool
    {
        return $this->access->canMute($user, $chat);
    }
}
