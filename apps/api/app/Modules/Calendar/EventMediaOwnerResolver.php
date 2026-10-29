<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

use App\Modules\Calendar\Models\Event;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Contracts\MediaOwnerResolver;
use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;

final readonly class EventMediaOwnerResolver implements MediaOwnerResolver
{
    public function __construct(private EventAccess $access) {}

    public function canView(User $user, Media $media): ?bool
    {
        $attachment = MediaAttachment::query()
            ->where('media_id', $media->id)
            ->where('attachable_type', (new Event)->getMorphClass())
            ->first();
        if ($attachment === null) {
            return null;
        }
        $event = Event::query()->find($attachment->attachable_id);

        return $event !== null && $this->access->canView($user, $event);
    }
}
