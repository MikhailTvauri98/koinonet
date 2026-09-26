<?php

declare(strict_types=1);

namespace App\Modules\Media\Actions;

use App\Modules\Directory\Contracts\AccountEraser;
use App\Modules\Media\Console\PruneOrphanMediaCommand;
use App\Modules\Media\Models\Media;

/**
 * Media's part of erasing an account (architecture 7.9): every file the
 * account uploaded loses its uploader. A file still used by an object - a
 * ministry cover it set - stays with that object. A file nothing uses any
 * longer - its unattached uploads, the photo `people:erase` has just taken
 * off the card - is now an orphan nobody can see or attach, and
 * {@see PruneOrphanMediaCommand} deletes it on its next run.
 */
final readonly class MediaAccountEraser implements AccountEraser
{
    public function eraseAccount(string $userId): void
    {
        Media::query()->where('uploader_user_id', $userId)->update(['uploader_user_id' => null]);
    }
}
