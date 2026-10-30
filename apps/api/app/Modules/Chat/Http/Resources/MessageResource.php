<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Resources;

use App\Modules\Chat\MessageCursor;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Http\Resources\MediaResource;
use App\Modules\Media\SignedMediaUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Str;

/** @mixin Message */
final class MessageResource extends JsonResource
{
    /** @return array{id: string, chat_id: string, sender: array{id: string, person: array{id: string, full_name: string|null, photo_thumb_url: string|null}}|null, body: string|null, reply_to: array{id: string, sender_name: string|null, body_preview: string|null, deleted: bool}|null, attachments: AnonymousResourceCollection, edited_at: string|null, deleted: bool, created_at: string, cursor: string} */
    public function toArray(Request $request): array
    {
        $message = $this->resource;
        assert($message instanceof Message);
        $viewer = $request->user();
        assert($viewer instanceof User);
        $sender = $message->sender;
        $person = $sender?->person;
        $visible = $person !== null && Gate::forUser($viewer)->allows('view', $person);
        $reply = $message->isDeleted() ? null : $message->replyTo;
        $replyPerson = $reply?->sender?->person;
        $replyVisible = $replyPerson !== null && Gate::forUser($viewer)->allows('view', $replyPerson);

        return [
            'id' => $message->id,
            'chat_id' => $message->chat_id,
            'sender' => $sender !== null && $person !== null ? [
                'id' => $sender->id,
                'person' => ['id' => (string) $person->id, 'full_name' => $visible ? $person->fullName() : null,
                    'photo_thumb_url' => $visible ? SignedMediaUrl::variant($person->photo, 'thumb') : null],
            ] : null,
            'body' => $message->isDeleted() ? null : $message->body,
            'reply_to' => $reply !== null ? [
                'id' => $reply->id,
                'sender_name' => $replyVisible ? $replyPerson->fullName() : null,
                'body_preview' => $reply->isDeleted() ? null : Str::limit($reply->body ?? '', 150),
                'deleted' => (bool) $reply->isDeleted(),
            ] : null,
            'attachments' => MediaResource::collection($message->isDeleted() ? collect() : $message->attachments->pluck('media')),
            /** @format date-time */
            'edited_at' => $message->edited_at?->toISOString(),
            'deleted' => (bool) $message->isDeleted(),
            /** @format date-time */
            'created_at' => (string) $message->created_at->toISOString(),
            'cursor' => (string) MessageCursor::encode($message),
        ];
    }
}
