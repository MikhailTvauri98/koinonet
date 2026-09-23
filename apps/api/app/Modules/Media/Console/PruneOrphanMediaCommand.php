<?php

declare(strict_types=1);

namespace App\Modules\Media\Console;

use App\Modules\Media\MediaUsage;
use App\Modules\Media\Models\Media;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * `php artisan media:prune` (architecture 7.8): daily cleanup of files
 * nobody ever attached - older than 24 hours and unused by anything, a
 * polymorphic attachment or a direct reference alike (the same
 * {@see MediaUsage} predicate `AttachDirectMedia` and `DeleteOwnMedia`
 * check). A fresh unattached upload survives the window so an in-progress
 * form submission never loses its file mid-flight.
 *
 * Each candidate's check-then-delete runs in its own `DB::transaction()`
 * against a row-locked re-read ({@see Media::lockedFind()}), not one
 * transaction for the whole run: a file attached the instant after this
 * command last saw it unused must survive, and locking every candidate row
 * for the run's whole duration would block unrelated attach requests far
 * longer than necessary.
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
            ->each(function (Media $candidate) use ($usage, &$deleted): void {
                DB::transaction(function () use ($candidate, $usage, &$deleted): void {
                    $media = Media::lockedFind($candidate->id);

                    if ($usage->isUsed($media)) {
                        return;
                    }

                    Storage::disk($media->disk)->delete($media->storedPaths());
                    $media->delete();
                    $deleted++;
                });
            });

        $this->components->info("Удалено файлов без привязки: {$deleted}.");

        return self::SUCCESS;
    }
}
