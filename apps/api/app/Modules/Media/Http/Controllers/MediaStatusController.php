<?php

declare(strict_types=1);

namespace App\Modules\Media\Http\Controllers;

use App\Modules\Directory\Models\User;
use App\Modules\Media\Http\Resources\MediaResource;
use App\Modules\Media\MediaAccess;
use App\Modules\Media\Models\Media;
use Illuminate\Http\Request;

/**
 * A file's processing status as JSON, for `MediaUploader` (client) to poll
 * once a second until it turns `ready`. `GET /media/{media}` is the signed
 * delivery ({@see MediaDownloadController}), which answers with bytes behind
 * `X-Accel-Redirect`, not JSON, and 403s outright without a valid signature.
 * This returns the same {@see MediaResource} `POST /media` already returns,
 * on its own path so it never competes with the signed route, reachable by
 * session instead of signature (the client polls it before it has any signed
 * link to show - `url` only appears once a variant exists).
 *
 * Deliberately mirrors {@see MediaDownloadController}'s route-model-binding
 * choice and its reasoning: `{media}` arrives as a plain string, looked up
 * here with `find()` (not `findOrFail`), so a missing row and a row this
 * account isn't allowed to see both end at the same `abort(403)` - an
 * account fishing for which media ids exist gets no signal either way.
 */
final class MediaStatusController
{
    public function __invoke(Request $request, string $media, MediaAccess $access): MediaResource
    {
        $user = $request->user();
        assert($user instanceof User);

        $record = Media::query()->find($media);

        abort_if($record === null || ! $access->canView($user, $record), 403);

        return new MediaResource($record);
    }
}
