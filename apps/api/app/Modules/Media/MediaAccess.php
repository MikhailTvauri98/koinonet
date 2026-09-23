<?php

declare(strict_types=1);

namespace App\Modules\Media;

use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Contracts\MediaOwnerResolver;
use App\Modules\Media\Models\Media;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Support\Facades\Gate;

/**
 * Visibility rule for one media file: decided by whichever object owns it
 * (architecture 6.4), never by who merely uploaded it. Phase 1 has two
 * direct owners - a person's photo and a ministry's cover - checked here
 * by asking the Policy that already governs seeing that owner (through
 * `Gate`, so both branches pick up its full rule, including "own" - a
 * person sees their own photo without `people.view`, architecture 6.4).
 * A file matching neither is unattached and visible only to its uploader.
 *
 * Later phases add owners (chat avatar, message/announcement/event
 * attachment) without touching this class: they bind a
 * {@see MediaOwnerResolver} under the `media.owner_resolvers` tag, and it is
 * consulted here before the uploader fallback.
 */
final readonly class MediaAccess
{
    /** @param iterable<MediaOwnerResolver> $resolvers */
    public function __construct(
        private iterable $resolvers = [],
    ) {}

    public function canView(User $user, Media $media): bool
    {
        $person = Person::query()->where('photo_media_id', $media->id)->first();
        if ($person !== null) {
            return Gate::forUser($user)->allows('view', $person);
        }

        $ministry = Ministry::query()->where('cover_media_id', $media->id)->first();
        if ($ministry !== null) {
            return Gate::forUser($user)->allows('view', $ministry);
        }

        foreach ($this->resolvers as $resolver) {
            $result = $resolver->canView($user, $media);

            if ($result !== null) {
                return $result;
            }
        }

        // Not attached to any owner yet: only the account that uploaded it can see it.
        return $media->uploader_user_id === $user->id;
    }
}
