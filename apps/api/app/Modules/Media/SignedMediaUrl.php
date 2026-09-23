<?php

declare(strict_types=1);

namespace App\Modules\Media;

use App\Modules\Media\Http\Resources\MediaResource;
use App\Modules\Media\Models\Media;
use Illuminate\Support\Facades\URL;

/**
 * A signed `media.show` link for one variant of a media file - the same
 * construction {@see MediaResource}
 * already uses (architecture 7.8: 60-minute Laravel signature). Other
 * modules' own resources (`PersonResource`, `MinistryResource`,
 * `MemberResource`) call this instead of embedding the full
 * `MediaResource`, since they only ever need one link, not the whole media
 * record.
 *
 * Null whenever there is nothing to link to: no media at all, or that
 * variant hasn't been produced yet - still `processing`, or a failed job
 * (mirrors `MediaResource::thumb_url`, which is null for the same reason).
 */
final class SignedMediaUrl
{
    private const LIFETIME_MINUTES = 60;

    public static function variant(?Media $media, string $variant): ?string
    {
        if ($media === null || ! isset($media->variants[$variant])) {
            return null;
        }

        return URL::temporarySignedRoute(
            'media.show',
            now()->addMinutes(self::LIFETIME_MINUTES),
            ['media' => $media->id, 'variant' => $variant],
        );
    }
}
