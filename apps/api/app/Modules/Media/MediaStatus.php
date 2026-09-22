<?php

declare(strict_types=1);

namespace App\Modules\Media;

enum MediaStatus: string
{
    case Processing = 'processing';
    case Ready = 'ready';
    case Failed = 'failed';
}
