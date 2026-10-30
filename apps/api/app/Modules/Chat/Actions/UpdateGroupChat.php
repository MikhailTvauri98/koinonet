<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\Events\ChatMetadataChanged;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Actions\AttachDirectMedia;
use App\Modules\Media\MediaKind;
use App\Modules\Media\Models\Media;
use Illuminate\Support\Facades\DB;

final readonly class UpdateGroupChat
{
    public function __construct(private GroupChatGuard $guard, private AttachDirectMedia $media) {}

    public function handle(User $actor, Chat $chat, ?string $title = null, ?Media $avatar = null): Chat
    {
        return DB::transaction(function () use ($actor, $chat, $title, $avatar): Chat {
            $chat = $this->guard->lock($actor, $chat);
            if ($title !== null) {
                $chat->title = $this->guard->title($title);
            }
            if ($avatar !== null && $chat->avatar_media_id !== $avatar->id) {
                $this->media->handle($avatar, MediaKind::Image);
                $chat->avatar_media_id = $avatar->id;
            }
            if ($chat->isDirty()) {
                $chat->save();
                DB::afterCommit(fn () => ChatMetadataChanged::dispatch($chat->id));
            }

            return $chat;
        });
    }
}
