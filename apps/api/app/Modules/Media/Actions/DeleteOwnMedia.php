<?php

declare(strict_types=1);

namespace App\Modules\Media\Actions;

use App\Modules\Media\MediaUsage;
use App\Modules\Media\Models\Media;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\Storage;

/**
 * `DELETE /media/{id}` (architecture 7.8/8): an account removes its own
 * file while it is still unused. A file already used by anything - a
 * polymorphic attachment or a direct reference - is refused with the same
 * `media.already_attached` code {@see AttachDirectMedia} throws when trying
 * to attach one; detaching first is what section 8 means by "своё
 * непривязанное".
 */
final readonly class DeleteOwnMedia
{
    public function __construct(private MediaUsage $usage) {}

    public function handle(Media $media): void
    {
        if ($media->uploader_user_id !== auth()->id()) {
            throw DomainRuleException::because('media.not_owned', 'Файл загрузил другой аккаунт.');
        }

        if ($this->usage->isUsed($media)) {
            throw DomainRuleException::because(
                'media.already_attached',
                'Привязанный файл нельзя удалить: сначала отвяжите его.',
            );
        }

        Storage::disk($media->disk)->delete($media->storedPaths());

        $media->delete();
    }
}
