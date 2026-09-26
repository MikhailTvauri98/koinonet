<?php

declare(strict_types=1);

namespace App\Modules\Media\Jobs;

use App\Modules\Media\MediaStatus;
use App\Modules\Media\Models\Media;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Throwable;

/**
 * Runs {@see ImageProcessor} for one uploaded image and persists its result.
 * Any exception from processing - a corrupt or oversized file and a
 * transient disk or memory failure alike - marks the media `failed` at once,
 * without a retry, and is logged with its trace: telling the two apart is
 * not worth it when the person can simply upload the picture again.
 *
 * `$tries` and `failed()` therefore only cover what happens outside that
 * block - loading or saving the media row while the database is briefly
 * unavailable. `failed()` runs once those attempts are exhausted, so the
 * media never stays in `processing` forever.
 */
final class ProcessUploadedImage implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public readonly string $mediaId) {}

    public function handle(ImageProcessor $processor): void
    {
        $media = Media::query()->find($this->mediaId);

        if ($media === null) {
            return;
        }

        try {
            $result = $processor->process($media);
        } catch (Throwable $e) {
            Log::warning('Image processing failed', [
                'media_id' => $media->id,
                'exception' => $e,
            ]);

            $media->update(['status' => MediaStatus::Failed]);

            return;
        }

        $originalPath = $media->path;

        $media->update([
            'path' => $result['path'],
            'mime' => $result['mime'],
            'width' => $result['width'],
            'height' => $result['height'],
            'variants' => $result['variants'],
            'status' => MediaStatus::Ready,
        ]);

        // A converted original (HEIC to JPEG) lives under a new path; the old
        // file is removed only once the row points at the new one.
        if ($result['path'] !== $originalPath) {
            Storage::disk($media->disk)->delete($originalPath);
        }
    }

    public function failed(?Throwable $exception): void
    {
        Media::query()->whereKey($this->mediaId)->update(['status' => MediaStatus::Failed]);
    }
}
