<?php

declare(strict_types=1);

namespace App\Modules\Chat;

use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Contracts\MediaOwnerResolver;
use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;

final readonly class ChatMediaOwnerResolver implements MediaOwnerResolver
{
    public function __construct(private ChatAccess $access) {}

    public function canView(User $user, Media $media): ?bool
    {
        $chat = Chat::query()->where('avatar_media_id', $media->id)->first();
        if ($chat !== null) {
            return $this->access->canRead($user, $chat);
        }
        $attachment = MediaAttachment::query()->where('media_id', $media->id)
            ->where('attachable_type', (new Message)->getMorphClass())->first();
        if ($attachment === null) {
            return null;
        }
        $message = Message::query()->with('chat')->find($attachment->attachable_id);

        return $message !== null && ! $message->isDeleted() && $this->access->canRead($user, $message->chat);
    }
}
