<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\Events\ChatRead;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;

final readonly class MarkChatRead
{
    public function __construct(private ChatAccess $access) {}

    public function handle(User $user, Chat $chat, string $messageId): void
    {
        DB::transaction(function () use ($user, $chat, $messageId): void {
            $user = User::query()->findOrFail($user->id);
            $chat = Chat::query()->findOrFail($chat->id);
            // Serialize read updates and read the latest pointer after acquiring the lock.
            $member = $chat->members()->where('user_id', $user->id)->lockForUpdate()->first();
            if (! $this->access->canRead($user, $chat)) {
                throw new AuthorizationException;
            }
            if ($member === null) {
                throw DomainRuleException::because('chat.read_only', 'Отмечать прочитанное могут только участники чата.');
            }
            $message = $chat->messages()->find($messageId);
            if ($message === null) {
                throw DomainRuleException::because('message.not_in_chat', 'Сообщение не принадлежит этому чату.');
            }
            if ($member->last_read_message_id !== null && ! $chat->messages()->whereKey($messageId)
                ->whereRaw('(created_at, id) > (select created_at, id from messages where id = ?)', [$member->last_read_message_id])->exists()) {
                return;
            }
            $member->update(['last_read_message_id' => $message->id]);
            DB::afterCommit(static fn () => ChatRead::dispatch($chat->id, $user->id));
        });
    }
}
