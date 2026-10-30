<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\Events\ChatMembersChanged;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\User;
use Illuminate\Support\Facades\DB;

final class SyncMinistryChatMember
{
    public function add(Chat $chat, User $user): void
    {
        DB::transaction(function () use ($chat, $user): void {
            $member = ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $user->id], ['joined_at' => now()]);
            if ($member->wasRecentlyCreated) {
                DB::afterCommit(fn () => ChatMembersChanged::dispatch($chat->id, [$user->id], []));
            }
        });
    }

    public function remove(Chat $chat, User $user): void
    {
        DB::transaction(function () use ($chat, $user): void {
            if (ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $user->id)->delete() > 0) {
                DB::afterCommit(fn () => ChatMembersChanged::dispatch($chat->id, [], [$user->id]));
            }
        });
    }
}
