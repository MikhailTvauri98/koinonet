<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\Events\ChatMembersChanged;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Support\Facades\DB;

final readonly class AddGroupMembers
{
    public function __construct(private GroupChatGuard $guard) {}

    /** @param list<string> $userIds */
    public function handle(User $actor, Chat $chat, array $userIds): Chat
    {
        return DB::transaction(function () use ($actor, $chat, $userIds): Chat {
            // Lock all accounts first in one order, before any chat membership.
            User::query()->whereIn('id', [$actor->id, ...$userIds])->orderBy('id')->lockForUpdate()->get();
            $chat = $this->guard->lock($actor, $chat);
            $ids = $this->guard->members($userIds);
            $added = [];
            foreach ($ids as $id) {
                if ($chat->members->contains('user_id', $id)) {
                    continue;
                }
                $chat->members()->create(['user_id' => $id, 'is_owner' => false, 'joined_at' => now()]);
                $added[] = $id;
            }
            if ($added !== []) {
                DB::afterCommit(fn () => ChatMembersChanged::dispatch($chat->id, $added, []));
            }

            return $chat->unsetRelation('members');
        });
    }
}
