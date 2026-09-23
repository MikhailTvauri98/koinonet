<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Directory\Models\Person;
use App\Modules\Media\Actions\AttachDirectMedia;
use App\Modules\Media\MediaKind;
use App\Modules\Media\Models\Media;

/**
 * Writes `people.photo_media_id` - Directory's own column (architecture
 * 5.8/5.2), so only Directory's own Action sets it (boundary rule 1).
 * {@see AttachDirectMedia} only validates the file and never touches
 * `people` itself.
 */
final readonly class SetPersonPhoto
{
    public function __construct(private AttachDirectMedia $attachDirectMedia) {}

    public function handle(Person $person, Media $media): Person
    {
        $this->attachDirectMedia->handle($media, MediaKind::Image);

        $person->fill(['photo_media_id' => $media->id])->save();

        return $person;
    }
}
