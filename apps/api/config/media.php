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
    | header or the filename) to the extensions a file of that type may
    | carry in its own name; the first one is the extension it is stored
    | under. A document is downloaded under its own name, so the name's
    | extension must be one of these too: a script that reads as plain text
    | (greeting.vbs) must not get through. Every kind's extensions count for
    | every upload, since the content can land in another kind than the name
    | suggests, such as an m4a recording whose generic brand finfo reports as
    | video/mp4.
    |
    */

    'limits' => [

        'image' => [
            'max_size' => 10 * 1024 * 1024,
            'mimes' => [
                // Chrome on Windows saves some JPEGs as .jfif.
                'image/jpeg' => ['jpg', 'jpeg', 'jpe', 'jfif'],
                'image/png' => ['png'],
                'image/webp' => ['webp'],
                'image/gif' => ['gif'],
                'image/heic' => ['heic'],
                'image/heif' => ['heif'],
            ],
        ],

        'file' => [
            'max_size' => 50 * 1024 * 1024,
            'mimes' => [
                'application/pdf' => ['pdf'],
                'application/msword' => ['doc'],
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['docx'],
                'application/vnd.ms-excel' => ['xls'],
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['xlsx'],
                'application/vnd.ms-powerpoint' => ['ppt'],
                'application/vnd.openxmlformats-officedocument.presentationml.presentation' => ['pptx'],
                'text/plain' => ['txt'],
                'text/csv' => ['csv'],
                'application/zip' => ['zip'],
                'audio/mpeg' => ['mp3'],
                'audio/mp4' => ['m4a'],
                // finfo reports an m4a recording (brand "M4A ") as audio/x-m4a.
                'audio/x-m4a' => ['m4a'],
                // Messengers send voice notes as Ogg Opus files named .opus.
                'audio/ogg' => ['ogg', 'oga', 'opus'],
            ],
        ],

        'video' => [
            'max_size' => 100 * 1024 * 1024,
            'mimes' => [
                'video/mp4' => ['mp4'],
                'video/quicktime' => ['mov'],
                'video/webm' => ['webm'],
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
    | HEIC and HEIF need imagick built with libheif to be read and converted
    | to JPEG during processing. Computed once at config load so StoreMedia
    | can reject them with a clear error instead of accepting a file the
    | pipeline cannot process.
    |
    */

    'heic_supported' => extension_loaded('imagick') && in_array('HEIC', Imagick::queryFormats(), true),

];
