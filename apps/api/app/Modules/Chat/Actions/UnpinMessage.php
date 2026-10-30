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

final readonly class UnpinMessage
{
    public function handle(Message $message, User $actor): void
    {
        DB::transaction(function () use ($message, $actor): void {
            $chat = Chat::query()->lockForUpdate()->findOrFail($message->chat_id);
            $message = Message::query()->lockForUpdate()->findOrFail($message->id);
            $actor = User::query()->findOrFail($actor->id);
            $message->setRelation('chat', $chat);
            Gate::forUser($actor)->authorize('pin', $message);
            if ($chat->pins()->where('message_id', $message->id)->delete() === 0) {
                throw DomainRuleException::because('message.not_pinned', 'Сообщение не закреплено.');
            }
            DB::afterCommit(static fn () => ChatPinsChanged::dispatch($chat->id));
        });
    }
}
