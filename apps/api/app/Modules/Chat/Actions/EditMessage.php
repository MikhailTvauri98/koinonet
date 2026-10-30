<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\Events\MessageEdited;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final readonly class EditMessage
{
    public function handle(Message $message, string $body, User $actor): Message
    {
        return DB::transaction(function () use ($message, $body, $actor): Message {
            $chat = Chat::query()->lockForUpdate()->findOrFail($message->chat_id);
            $message = Message::query()->lockForUpdate()->findOrFail($message->id);
            $actor = User::query()->findOrFail($actor->id);
            $message->setRelation('chat', $chat);
            Gate::forUser($actor)->authorize('update', $message);
            if ($message->isDeleted()) {
                throw DomainRuleException::because('message.deleted', 'Сообщение уже удалено.');
            }
            $body = trim($body);
            if (mb_strlen($body) > 4000) {
                throw ValidationException::withMessages(['body' => 'Текст сообщения не должен превышать 4000 символов.']);
            }
            if ($body === '' && ! $message->attachments()->exists()) {
                throw DomainRuleException::because('message.empty', 'Сообщение без текста должно содержать вложение.');
            }
            $message->update(['body' => $body === '' ? null : $body, 'edited_at' => now()]);
            DB::afterCommit(static fn () => MessageEdited::dispatch($chat->id, $message->id));

            return $message->load('sender.person.photo', 'replyTo.sender.person', 'attachments.media');
        });
    }
}
