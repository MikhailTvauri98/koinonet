<?php

declare(strict_types=1);

namespace App\Modules\Chat;

use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

final class UnreadCounter
{
    public function forChat(User $user, Chat $chat): int
    {
        return $this->forChats($user, collect([$chat]))[$chat->id];
    }

    public function total(User $user): int
    {
        return $user->isDisabled() ? 0 : $this->query($user)->count();
    }

    /**
     * @param  Collection<int, Chat>  $chats
     * @return array<string, int>
     */
    public function forChats(User $user, Collection $chats): array
    {
        $counts = array_fill_keys($chats->map(fn (Chat $chat): string => $chat->id)->all(), 0);
        if ($counts === [] || $user->isDisabled()) {
            return $counts;
        }
        $rows = $this->query($user)->whereIn('messages.chat_id', array_keys($counts))
            ->selectRaw('messages.chat_id, count(*) as unread_count')->groupBy('messages.chat_id')->get();
        foreach ($rows as $row) {
            $counts[$row->chat_id] = (int) $row->unread_count;
        }

        return $counts;
    }

    private function query(User $user): Builder
    {
        return DB::table('messages')
            ->join('chat_members', 'chat_members.chat_id', '=', 'messages.chat_id')
            ->leftJoin('messages as cursor', 'cursor.id', '=', 'chat_members.last_read_message_id')
            ->where('chat_members.user_id', $user->id)
            ->whereNull('messages.deleted_at')
            ->whereRaw('messages.sender_user_id IS DISTINCT FROM ?', [$user->id])
            ->where(fn (Builder $query): Builder => $query->whereNull('chat_members.last_read_message_id')
                ->orWhereRaw('(messages.created_at, messages.id) > (cursor.created_at, cursor.id)'));
    }
}
