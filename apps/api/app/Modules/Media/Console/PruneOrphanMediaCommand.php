<?php

declare(strict_types=1);

namespace App\Modules\Media\Console;

use App\Modules\Media\MediaUsage;
use App\Modules\Media\Models\Media;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

/**
 * `php artisan media:prune` (architecture 7.8): daily cleanup of files
 * nobody ever attached - older than 24 hours and unused by anything, a
 * polymorphic attachment or a direct reference alike (the same
 * {@see MediaUsage} predicate `AttachDirectMedia` and `DeleteOwnMedia`
 * check). A fresh unattached upload survives the window so an in-progress
 * form submission never loses its file mid-flight.
 */
final class PruneOrphanMediaCommand extends Command
{
    protected $signature = 'media:prune';

    protected $description = 'Удалить непривязанные медиафайлы старше суток вместе с их вариантами';

    public function handle(MediaUsage $usage): int
    {
        $deleted = 0;

        Media::query()
            ->where('created_at', '<', now()->subDay())
            ->each(function (Media $media) use ($usage, &$deleted): void {
                if ($usage->isUsed($media)) {
                    return;
                }

                Storage::disk($media->disk)->delete($media->storedPaths());
                $media->delete();
                $deleted++;
            });

        $this->components->info("Удалено файлов без привязки: {$deleted}.");

        return self::SUCCESS;
    }
}
