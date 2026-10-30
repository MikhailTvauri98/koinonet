<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\Events\ChatMembersChanged;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;

final readonly class RemoveGroupMember
{
    public function __construct(private GroupChatGuard $guard) {}

    public function handle(User $actor, Chat $chat, string $userId, bool $leaving = false): Chat
    {
        return DB::transaction(function () use ($actor, $chat, $userId, $leaving): Chat {
            if ($leaving && $userId !== $actor->id) {
                throw new AuthorizationException;
            }
            $chat = $this->guard->lock($actor, $chat, $leaving);
            $member = $chat->members->firstWhere('user_id', $userId);
            if ($member?->is_owner) {
                throw DomainRuleException::because('chat.owner_cannot_leave', 'Владелец не может покинуть группу. Архивируйте её.');
            }
            if ($member !== null) {
                $member->delete();
                DB::afterCommit(fn () => ChatMembersChanged::dispatch($chat->id, [], [$userId]));
            }

            return $chat->unsetRelation('members');
        });
    }
}
