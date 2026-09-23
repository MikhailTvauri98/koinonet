<?php

declare(strict_types=1);

namespace App\Modules\Media\Http\Resources;

use App\Modules\Media\Models\Media;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\URL;

/** @mixin Media */
final class MediaResource extends JsonResource
{
    /**
     * The lifetime of `url` and `thumb_url` (architecture 7.8): 60 minutes,
     * matching the plan's global limit on signed media links.
     */
    private const SIGNATURE_LIFETIME_MINUTES = 60;

    /**
     * `url` and `thumb_url` are already-signed `media.show` links - the
     * client never builds or holds a signature itself. `thumb_url` is null
     * when processing has not produced a `thumb` variant (not yet ready, a
     * non-image kind, or a failed job).
     *
     * @return array{id: string, kind: string, status: string, url: string, thumb_url: string|null}
     */
    public function toArray(Request $request): array
    {
        $media = $this->resource;
        assert($media instanceof Media);

        return [
            'id' => $media->id,
            'kind' => $media->kind->value,
            'status' => $media->status->value,
            'url' => $this->signedUrl($media),
            'thumb_url' => isset($media->variants['thumb']) ? $this->signedUrl($media, 'thumb') : null,
        ];
    }

    private function signedUrl(Media $media, ?string $variant = null): string
    {
        $parameters = $variant === null
            ? ['media' => $media->id]
            : ['media' => $media->id, 'variant' => $variant];

        return URL::temporarySignedRoute(
            'media.show',
            now()->addMinutes(self::SIGNATURE_LIFETIME_MINUTES),
            $parameters,
        );
    }
}
