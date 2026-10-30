<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\Events\ChatPinsChanged;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final readonly class PinMessage
{
    public function handle(Message $message, User $actor): void
    {
        DB::transaction(function () use ($message, $actor): void {
            $chat = Chat::query()->lockForUpdate()->findOrFail($message->chat_id);
            $message = Message::query()->lockForUpdate()->findOrFail($message->id);
            $actor = User::query()->findOrFail($actor->id);
            $message->setRelation('chat', $chat);
            Gate::forUser($actor)->authorize('pin', $message);
            if ($message->isDeleted()) {
                throw DomainRuleException::because('message.deleted', 'Сообщение уже удалено.');
            }
            if ($chat->pins()->where('message_id', $message->id)->exists()) {
                throw DomainRuleException::because('message.already_pinned', 'Сообщение уже закреплено.');
            }
            $chat->pins()->create(['message_id' => $message->id, 'pinned_by_user_id' => $actor->id, 'pinned_at' => now()]);
            DB::afterCommit(static fn () => ChatPinsChanged::dispatch($chat->id));
        });
    }
}
