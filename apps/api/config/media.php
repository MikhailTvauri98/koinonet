<?php

declare(strict_types=1);

return [

    /*
    |--------------------------------------------------------------------------
    | Media limits
    |--------------------------------------------------------------------------
    |
    | Maximum size in bytes and the content-type whitelist per media kind
    | (architecture section 7.8). Each "mimes" entry maps a MIME type
    | detected from the file's actual content (finfo, never the client's
    | header or the filename) to the extension the file is stored under.
    |
    */

    'limits' => [

        'image' => [
            'max_size' => 10 * 1024 * 1024,
            'mimes' => [
                'image/jpeg' => 'jpg',
                'image/png' => 'png',
                'image/webp' => 'webp',
                'image/gif' => 'gif',
                'image/heic' => 'heic',
            ],
        ],

        'file' => [
            'max_size' => 50 * 1024 * 1024,
            'mimes' => [
                'application/pdf' => 'pdf',
                'application/msword' => 'doc',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
                'application/vnd.ms-excel' => 'xls',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
                'application/vnd.ms-powerpoint' => 'ppt',
                'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
                'text/plain' => 'txt',
                'text/csv' => 'csv',
                'application/zip' => 'zip',
                'audio/mpeg' => 'mp3',
                'audio/mp4' => 'm4a',
                'audio/ogg' => 'ogg',
            ],
        ],

        'video' => [
            'max_size' => 100 * 1024 * 1024,
            'mimes' => [
                'video/mp4' => 'mp4',
                'video/quicktime' => 'mov',
                'video/webm' => 'webm',
            ],
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Pixel limit
    |--------------------------------------------------------------------------
    |
    | The largest image, in pixels, that processing agrees to decode: the
    | dimensions are read from the file header first, so a small file that
    | declares huge dimensions is refused before memory is spent on it. 50
    | megapixels let through photos from 48 and 50 megapixel phone cameras.
    |
    */

    'max_image_pixels' => 50_000_000,

    /*
    |--------------------------------------------------------------------------
    | HEIC support
    |--------------------------------------------------------------------------
    |
    | HEIC needs imagick built with libheif to be read and converted to JPEG
    | during processing. Computed once at config load so StoreMedia can reject
    | HEIC with a clear error instead of accepting a file the pipeline cannot
    | process.
    |
    */

    'heic_supported' => extension_loaded('imagick') && in_array('HEIC', Imagick::queryFormats(), true),

];
