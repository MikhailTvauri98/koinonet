<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Actions;

use App\Modules\Media\Actions\AttachDirectMedia;
use App\Modules\Media\MediaKind;
use App\Modules\Media\Models\Media;
use App\Modules\Ministries\Models\Ministry;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;

/**
 * Writes `ministries.cover_media_id` - Ministries' own column (architecture
 * 5.8/5.3), so only Ministries' own Action sets it (boundary rule 1).
 * {@see AttachDirectMedia} only validates the file and never touches
 * `ministries` itself.
 *
 * Validation and write happen inside one `DB::transaction()`: this is the
 * transaction boundary `AttachDirectMedia` documents needing, since its row
 * lock on `media` only protects the invariant while a transaction stays
 * open around both the check and this class's own write.
 */
final readonly class SetMinistryCover
{
    public function __construct(private AttachDirectMedia $attachDirectMedia) {}

    public function handle(Ministry $ministry, Media $media): Ministry
    {
        if ($ministry->archived_at !== null) {
            throw DomainRuleException::because('ministry.archived', 'Архивное служение изменить нельзя.');
        }

        DB::transaction(function () use ($ministry, $media): void {
            $this->attachDirectMedia->handle($media, MediaKind::Image);

            $ministry->fill(['cover_media_id' => $media->id])->save();
        });

        return $ministry;
    }
}
