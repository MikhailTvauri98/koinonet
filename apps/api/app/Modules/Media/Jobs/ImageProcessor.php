<?php

declare(strict_types=1);

namespace App\Modules\Media\Jobs;

use App\Modules\Media\Models\Media;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Storage;
use Imagick;
use Intervention\Image\Drivers\Imagick\Driver as ImagickDriver;
use Intervention\Image\Drivers\Imagick\Modifiers\StripMetaModifier;
use Intervention\Image\Encoders\JpegEncoder;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\ImageManager;
use Intervention\Image\Interfaces\ImageInterface;
use RuntimeException;

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

    private const JPEG_QUALITY = 85;

    public function __construct(
        private ImageManager $manager = new ImageManager(new ImagickDriver),
    ) {}

    /**
     * Refuses an image over `media.max_image_pixels` before decoding it,
     * then strips metadata, rotates by EXIF orientation, downsizes the
     * original to at most 2000px on its longer side (never upscaling it),
     * and writes `thumb` (320px) and `large` (1080px) WebP variants
     * alongside it.
     *
     * A HEIC original comes back as a JPEG under a `.jpg` path (architecture
     * 7.8): Imagick here reads HEIC but cannot write it, and browsers other
     * than Safari cannot show it. The caller records the new `path` and
     * `mime` and removes the old file.
     *
     * @return array{path: string, mime: string, width: int, height: int, variants: array<string, string>}
     */
    public function process(Media $media): array
    {
        $disk = Storage::disk($media->disk);
        $source = $disk->path($media->path);

        $this->ensureWithinPixelLimit($source);

        $image = $this->manager->decodePath($source);

        // The Imagick decoder already turns the pixels upright while reading
        // (its autoOrientation option is on by default), so this call
        // normally changes nothing; it keeps the result upright should that
        // option ever be off. Either way the orientation is applied before
        // the metadata carrying it is discarded below.
        $image->orient();
        $image->modify(new StripMetaModifier);
        $image->removeProfile();

        if (max($image->width(), $image->height()) > self::MAX_DIMENSION) {
            $image->scaleDown(self::MAX_DIMENSION, self::MAX_DIMENSION);
        }

        $directory = pathinfo($media->path, PATHINFO_DIRNAME);
        $basename = pathinfo($media->path, PATHINFO_FILENAME);

        if ($media->mime === 'image/heic') {
            $path = "{$directory}/{$basename}.jpg";
            $mime = 'image/jpeg';
            $disk->put($path, (string) $image->encode(new JpegEncoder(quality: self::JPEG_QUALITY)));
        } else {
            // Any other format is written back under its own path: without
            // an encoder, encode() re-uses the format it was decoded from.
            $path = $media->path;
            $mime = $media->mime;
            $disk->put($path, (string) $image->encode());
        }

        return [
            'path' => $path,
            'mime' => $mime,
            'width' => $image->width(),
            'height' => $image->height(),
            'variants' => [
                'thumb' => $this->writeVariant($disk, $image, $directory, $basename, 'thumb', self::THUMB_DIMENSION),
                'large' => $this->writeVariant($disk, $image, $directory, $basename, 'large', self::LARGE_DIMENSION),
            ],
        ];
    }

    /**
     * A small file can declare enormous dimensions (a "pixel bomb"), and
     * decoding allocates memory for every pixel: the size is read from the
     * header alone and checked first.
     */
    private function ensureWithinPixelLimit(string $path): void
    {
        [$width, $height] = $this->dimensions($path);
        $limit = (int) config('media.max_image_pixels');

        if ($width * $height > $limit) {
            throw new RuntimeException("The image is {$width}x{$height}, over the limit of {$limit} pixels.");
        }
    }

    /**
     * `getimagesize()` parses only the header. PHP 8.4's does not know HEIC;
     * for it Imagick's ping reads the header without decoding pixels.
     *
     * @return array{int, int}
     */
    private function dimensions(string $path): array
    {
        $size = @getimagesize($path);

        if ($size !== false && $size[0] > 0 && $size[1] > 0) {
            return [$size[0], $size[1]];
        }

        $probe = new Imagick;
        $probe->pingImage($path);

        return [$probe->getImageWidth(), $probe->getImageHeight()];
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
