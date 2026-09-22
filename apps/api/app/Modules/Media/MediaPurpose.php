<?php

declare(strict_types=1);

namespace App\Modules\Media;

enum MediaPurpose: string
{
    case Message = 'message';
    case Announcement = 'announcement';
    case Event = 'event';
    case PersonPhoto = 'person_photo';
    case MinistryCover = 'ministry_cover';
    case ChatAvatar = 'chat_avatar';
}
