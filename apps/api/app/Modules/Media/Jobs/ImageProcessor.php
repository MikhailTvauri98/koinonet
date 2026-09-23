<?php

declare(strict_types=1);

namespace App\Modules\Media\Jobs;

use App\Modules\Media\Models\Media;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Drivers\Imagick\Driver as ImagickDriver;
use Intervention\Image\Drivers\Imagick\Modifiers\StripMetaModifier;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\ImageManager;
use Intervention\Image\Interfaces\ImageInterface;

/**
 * Turns a freshly uploaded image into something safe to serve: no EXIF or
 * ICC metadata (a phone's GPS tag has no business leaving the server),
 * upright regardless of how the camera held it, and no larger than it needs
 * to be. Imagick is the only driver in this codebase that can decode HEIC
 * (`config('media.heic_supported')` already gates uploads on it), so it is
 * used here too rather than GD, which cannot read HEIC at all.
 */
final readonly class ImageProcessor
{
    private const MAX_DIMENSION = 2000;

    private const THUMB_DIMENSION = 320;

    private const LARGE_DIMENSION = 1080;

    private const WEBP_QUALITY = 80;

    public function __construct(
        private ImageManager $manager = new ImageManager(new ImagickDriver),
    ) {}

    /**
     * Strips metadata, rotates by EXIF orientation, downsizes the original to
     * at most 2000px on its longer side (never upscaling it), and writes
     * `thumb` (320px) and `large` (1080px) WebP variants alongside it.
     *
     * @return array{width: int, height: int, variants: array<string, string>}
     */
    public function process(Media $media): array
    {
        $disk = Storage::disk($media->disk);

        $image = $this->manager->decodePath($disk->path($media->path));

        // orient() must run first: it reads the EXIF orientation tag to
        // physically rotate the pixels, which only makes sense before that
        // tag (and the rest of the metadata) is discarded below.
        $image->orient();
        $image->modify(new StripMetaModifier);
        $image->removeProfile();

        if (max($image->width(), $image->height()) > self::MAX_DIMENSION) {
            $image->scaleDown(self::MAX_DIMENSION, self::MAX_DIMENSION);
        }

        // Written back under its own extension, encode() re-uses the format
        // the file was decoded from.
        $disk->put($media->path, (string) $image->encode());

        $directory = pathinfo($media->path, PATHINFO_DIRNAME);
        $basename = pathinfo($media->path, PATHINFO_FILENAME);

        return [
            'width' => $image->width(),
            'height' => $image->height(),
            'variants' => [
                'thumb' => $this->writeVariant($disk, $image, $directory, $basename, 'thumb', self::THUMB_DIMENSION),
                'large' => $this->writeVariant($disk, $image, $directory, $basename, 'large', self::LARGE_DIMENSION),
            ],
        ];
    }

    /**
     * Scales a clone of the (already stripped and downsized) original down to
     * fit within a `$maxDimension` box and stores it as a WebP variant next
     * to the original.
     */
    private function writeVariant(
        Filesystem $disk,
        ImageInterface $original,
        string $directory,
        string $basename,
        string $name,
        int $maxDimension,
    ): string {
        $variant = clone $original;
        $variant->scaleDown($maxDimension, $maxDimension);

        $path = "{$directory}/{$basename}_{$name}.webp";
        $disk->put($path, (string) $variant->encode(new WebpEncoder(quality: self::WEBP_QUALITY)));

        return $path;
    }
}
