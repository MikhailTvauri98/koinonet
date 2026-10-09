<?php

declare(strict_types=1);

namespace App\Modules\Media;

/**
 * HEIC and HEIF are one container format under two content types: finfo
 * reports `image/heic` for the `heic` brand and `image/heif` for `mif1`.
 * Either needs imagick with libheif to be read, and is converted to JPEG.
 */
final class HeifImage
{
    private const array MIMES = ['image/heic', 'image/heif'];

    public static function is(string $mime): bool
    {
        return in_array($mime, self::MIMES, true);
    }
}
