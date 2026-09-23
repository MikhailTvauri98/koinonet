<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Directory\Models\Person;
use App\Modules\Media\Actions\AttachDirectMedia;
use App\Modules\Media\MediaKind;
use App\Modules\Media\Models\Media;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

/**
 * Writes `people.photo_media_id` - Directory's own column (architecture
 * 5.8/5.2), so only Directory's own Action sets it (boundary rule 1).
 * {@see AttachDirectMedia} only validates the file and never touches
 * `people` itself.
 *
 * Validation and write happen inside one `DB::transaction()`: this is the
 * transaction boundary `AttachDirectMedia` documents needing, since its row
 * lock on `media` only protects the invariant while a transaction stays
 * open around both the check and this class's own write.
 */
final readonly class SetPersonPhoto
{
    public function __construct(private AttachDirectMedia $attachDirectMedia) {}

    public function handle(Person $person, Media $media): Person
    {
        if ($person->archived_at !== null) {
            throw DomainRuleException::because('person.archived', 'Архивного человека изменить нельзя.');
        }

        DB::transaction(function () use ($person, $media): void {
            $this->attachDirectMedia->handle($media, MediaKind::Image);

            $person->fill(['photo_media_id' => $media->id])->save();
        });

        return $person;
    }
}
