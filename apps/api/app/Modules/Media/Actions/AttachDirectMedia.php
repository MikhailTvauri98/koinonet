<?php

declare(strict_types=1);

namespace App\Modules\Media\Actions;

use App\Modules\Media\MediaKind;
use App\Modules\Media\MediaStatus;
use App\Modules\Media\MediaUsage;
use App\Modules\Media\Models\Media;
use App\Support\DomainRuleException;

/**
 * Validates a media file for a direct reference - a person's photo, a
 * ministry's cover - before the owning module points its own column at it
 * (architecture 5.8: those references live on `people`/`ministries`
 * directly, not through `media_attachments`, so this class only checks and
 * never writes). Called from Directory's and Ministries' own Actions, which
 * write to their own tables afterwards (boundary rule 1): this class never
 * touches `people` or `ministries` itself, only reads them through
 * {@see MediaUsage} to decide whether the file is free to use.
 *
 * Re-reads `$media` row-locked ({@see Media::lockedFind()}) before checking
 * it, so two concurrent attach attempts for the same file serialize instead
 * of both seeing "free". That protection only holds for as long as a
 * transaction stays open around the check-then-write sequence, so this must
 * always run inside one already started by the caller - `SetPersonPhoto`
 * and `SetMinistryCover` wrap their whole "validate, then set the column"
 * in `DB::transaction()`; this method never opens one itself, because
 * committing here would release the lock before the caller's write runs.
 */
final readonly class AttachDirectMedia
{
    public function __construct(private MediaUsage $usage) {}

    public function handle(Media $media, MediaKind $expected): void
    {
        $media = Media::lockedFind($media->id);

        if (! $media->isUploadedBy(auth()->id())) {
            throw DomainRuleException::because('media.not_owned', 'Файл загрузил другой аккаунт.');
        }

        if ($media->kind !== $expected) {
            throw DomainRuleException::because('media.wrong_kind', 'Этот вид файла сюда не подходит.');
        }

        // A file still in processing has no variants and may yet fail; a
        // failed one never gets them.
        if ($media->status !== MediaStatus::Ready) {
            throw DomainRuleException::because('media.not_ready', 'Файл ещё не обработан или не прошёл обработку.');
        }

        if ($this->usage->isUsed($media)) {
            throw DomainRuleException::because('media.already_attached', 'Файл уже используется в другом месте.');
        }
    }
}
