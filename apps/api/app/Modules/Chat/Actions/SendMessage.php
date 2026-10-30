<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\Events\MessageSent;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Actions\SyncAttachments;
use App\Support\DomainRuleException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final readonly class SendMessage
{
    public function __construct(private ChatAccess $access, private SyncAttachments $attachments) {}

    /** @param list<string> $mediaIds */
    public function handle(User $sender, Chat $chat, ?string $body, array $mediaIds, ?string $replyToId): Message
    {
        return DB::transaction(function () use ($sender, $chat, $body, $mediaIds, $replyToId): Message {
            // ArchiveChat takes this same lock: archive and send have one order.
            $chat = Chat::query()->lockForUpdate()->findOrFail($chat->id);
            if ($sender->isDisabled() || $this->access->member($sender, $chat) === null) {
                throw new AuthorizationException;
            }
            if ($chat->archived_at !== null) {
                throw DomainRuleException::because('chat.archived', 'Чат архивирован, писать в него нельзя.');
            }
            Gate::forUser($sender)->authorize('create', [Message::class, $chat]);
            $body = $body !== null && trim($body) !== '' ? trim($body) : null;
            if ($body !== null && mb_strlen($body) > 4000) {
                throw ValidationException::withMessages(['body' => 'Текст сообщения не должен превышать 4000 символов.']);
            }
            if ($body === null && $mediaIds === []) {
                throw DomainRuleException::because('message.empty', 'Сообщение без текста должно содержать вложение.');
            }
            if ($replyToId !== null && ! $chat->messages()->whereKey($replyToId)->exists()) {
                throw DomainRuleException::because('message.reply_other_chat', 'Отвечать можно только на сообщение этого чата.');
            }
            $message = $chat->messages()->create(['sender_user_id' => $sender->id, 'body' => $body, 'reply_to_id' => $replyToId]);
            $this->attachments->handle($message, $mediaIds, $sender);
            $chat->update(['last_message_id' => $message->id, 'last_message_at' => $message->created_at]);
            DB::afterCommit(static fn () => MessageSent::dispatch($chat->id, $message->id, $sender->id));

            return $message->load('sender.person.photo', 'replyTo.sender.person', 'attachments.media');
        });
    }
}
