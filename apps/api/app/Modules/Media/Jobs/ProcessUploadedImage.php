<?php

declare(strict_types=1);

namespace App\Modules\Media\Jobs;

use App\Modules\Media\MediaStatus;
use App\Modules\Media\Models\Media;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Runs {@see ImageProcessor} for one uploaded image and persists its result.
 * A file that fails to process (corrupt, unreadable, an unsupported HEIC
 * variant, ...) marks the media `failed` instead of leaving it stuck in
 * `processing` forever - that is handled inside handle() itself, since a
 * bad file is an expected outcome, not a reason to retry. `failed()` is a
 * backstop for the unexpected case where every attempt of a transient
 * failure (disk full, OOM, ...) is exhausted without handle() catching it.
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
                'exception' => $e->getMessage(),
            ]);

            $media->update(['status' => MediaStatus::Failed]);

            return;
        }

        $media->update([
            'width' => $result['width'],
            'height' => $result['height'],
            'variants' => $result['variants'],
            'status' => MediaStatus::Ready,
        ]);
    }

    public function failed(?Throwable $exception): void
    {
        Media::query()->whereKey($this->mediaId)->update(['status' => MediaStatus::Failed]);
    }
}
