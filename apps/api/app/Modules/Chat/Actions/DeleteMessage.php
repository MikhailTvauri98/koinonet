<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Chat\Events\MessageDeleted;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Actions\DeleteAttachedMedia;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final readonly class DeleteMessage
{
    public function __construct(private DeleteAttachedMedia $media, private AuditLogger $audit) {}

    public function handle(Message $message, User $actor): void
    {
        DB::transaction(function () use ($message, $actor): void {
            $chat = Chat::query()->lockForUpdate()->findOrFail($message->chat_id);
            $message = Message::query()->lockForUpdate()->findOrFail($message->id);
            $message->setRelation('chat', $chat);
            Gate::forUser($actor)->authorize('delete', $message);
            if ($message->isDeleted()) {
                throw DomainRuleException::because('message.deleted', 'Сообщение уже удалено.');
            }
            $this->media->handle($message);
            $message->update(['deleted_at' => now(), 'body' => null, 'reply_to_id' => null]);
            if ($message->sender_user_id !== $actor->id) {
                $this->audit->recordForActor($actor, 'message.deleted_by_moderator', $message, ['chat_id' => $chat->id]);
            }
            DB::afterCommit(static fn () => MessageDeleted::dispatch($chat->id, $message->id));
        });
    }
}
