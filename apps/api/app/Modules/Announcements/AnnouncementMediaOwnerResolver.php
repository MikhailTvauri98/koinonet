<?php

declare(strict_types=1);

namespace App\Modules\Announcements;

use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Contracts\MediaOwnerResolver;
use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;

final readonly class AnnouncementMediaOwnerResolver implements MediaOwnerResolver
{
    public function __construct(private AnnouncementVisibility $visibility) {}

    public function canView(User $user, Media $media): ?bool
    {
        $attachment = MediaAttachment::query()
            ->where('media_id', $media->id)
            ->where('attachable_type', (new Announcement)->getMorphClass())
            ->first();
        if ($attachment === null) {
            return null;
        }
        $announcement = Announcement::query()->find($attachment->attachable_id);

        return $announcement !== null && $this->visibility->canSee($user, $announcement);
    }
}
