<?php

declare(strict_types=1);

namespace App\Modules\Media\Contracts;

use App\Modules\Directory\Models\User;
use App\Modules\Media\MediaAccess;
use App\Modules\Media\Models\Media;

/**
 * One additional kind of media owner (section 6.4): a chat avatar, or an
 * attachment on a message, announcement or event. Person photos and ministry
 * covers are checked directly by {@see MediaAccess}. A module introducing
 * one of the other owners binds its resolver under the
 * `media.owner_resolvers` container tag instead of changing MediaAccess
 * itself.
 */
interface MediaOwnerResolver
{
    /**
     * Whether `$user` may view `$media`, decided by this resolver's owner
     * type, or null when `$media` isn't owned by that kind of object at all
     * (so `MediaAccess` moves on to the next resolver).
     */
    public function canView(User $user, Media $media): ?bool;
}
