<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Actions;

use App\Modules\Media\Actions\AttachDirectMedia;
use App\Modules\Media\MediaKind;
use App\Modules\Media\Models\Media;
use App\Modules\Ministries\Models\Ministry;

/**
 * Writes `ministries.cover_media_id` - Ministries' own column (architecture
 * 5.8/5.3), so only Ministries' own Action sets it (boundary rule 1).
 * {@see AttachDirectMedia} only validates the file and never touches
 * `ministries` itself.
 */
final readonly class SetMinistryCover
{
    public function __construct(private AttachDirectMedia $attachDirectMedia) {}

    public function handle(Ministry $ministry, Media $media): Ministry
    {
        $this->attachDirectMedia->handle($media, MediaKind::Image);

        $ministry->fill(['cover_media_id' => $media->id])->save();

        return $ministry;
    }
}
