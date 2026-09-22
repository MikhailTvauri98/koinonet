<?php

declare(strict_types=1);

namespace App\Modules\Media;

/**
 * What the caller intends to do with an uploaded file. Required by `POST /media`
 * (architecture 7.8) but not persisted on `media` (architecture 5.8 lists its full
 * composition) - task 23's binding endpoints are what check a file's kind actually
 * fits its purpose (e.g. an image for `person_photo`).
 */
enum MediaPurpose: string
{
    case Message = 'message';
    case Announcement = 'announcement';
    case Event = 'event';
    case PersonPhoto = 'person_photo';
    case MinistryCover = 'ministry_cover';
    case ChatAvatar = 'chat_avatar';
}
