<?php

declare(strict_types=1);

namespace App\Modules\Media;

use App\Modules\Directory\Models\Person;
use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;
use App\Modules\Ministries\Models\Ministry;

/**
 * Whether a media file is already used by anything - the single predicate
 * behind `media.already_attached` (architecture 7.8: "файл ещё не привязан"
 * governs both a polymorphic attachment and a direct reference alike).
 * Phase 1 has two direct owners, checked here the same way
 * {@see MediaAccess} checks them for visibility. A later phase that adds a
 * new direct owner (chat avatar) adds its column check to this class; its
 * visibility goes into a resolver under `media.owner_resolvers` instead.
 */
final readonly class MediaUsage
{
    public function isUsed(Media $media): bool
    {
        return MediaAttachment::query()->where('media_id', $media->id)->exists()
            || Person::query()->where('photo_media_id', $media->id)->exists()
            || Ministry::query()->where('cover_media_id', $media->id)->exists();
    }
}
