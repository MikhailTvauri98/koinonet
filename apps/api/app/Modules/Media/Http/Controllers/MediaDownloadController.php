<?php

declare(strict_types=1);

namespace App\Modules\Media\Http\Controllers;

use App\Modules\Directory\Models\User;
use App\Modules\Media\MediaAccess;
use App\Modules\Media\MediaKind;
use App\Modules\Media\Models\Media;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\HeaderUtils;

/**
 * Hands the caller a `X-Accel-Redirect` header instead of the file's bytes:
 * nginx reads `/_protected/{path}` (aliased to the `media` disk, section 7.8)
 * and streams the response itself, PHP never touches the file's contents.
 * The route this action sits behind (`media.show`) requires Laravel's
 * `signed` middleware, so reaching the handler at all already proves the
 * link carries a valid, unexpired signature (architecture 6.4 / 7.8).
 *
 * The `{media}` route parameter is taken as a plain string, not an
 * Eloquent-bound `Media $media`: implicit route-model binding runs before
 * route middleware, so a bound parameter would 404 on a nonexistent id
 * before `signed` gets a chance to reject a missing or invalid signature -
 * letting anyone authenticated fish for which media ids exist without ever
 * presenting a valid link. Looking the row up here, after `signed` has
 * already run, keeps every rejection for a bad or absent signature a
 * uniform 403 regardless of whether the id exists.
 */
final class MediaDownloadController
{
    public function __invoke(Request $request, string $media, MediaAccess $access): Response
    {
        $user = $request->user();
        assert($user instanceof User);

        // Reuses the `$media` name for the resolved row: the parameter must
        // stay named `media` to match the route's `{media}` placeholder.
        $media = Media::query()->findOrFail($media);

        abort_unless($access->canView($user, $media), 403);

        $variant = $request->query('variant');

        $path = match ($variant) {
            'thumb', 'large' => ($media->variants ?? [])[$variant] ?? $media->path,
            default => $media->path,
        };

        return response('', 200, [
            'Content-Type' => $media->mimeFor($path),
            'Content-Disposition' => $media->kind === MediaKind::File
                ? $this->attachmentNamed($media->original_name)
                : HeaderUtils::DISPOSITION_INLINE,
            'X-Accel-Redirect' => '/_protected/'.$path,
        ]);
    }

    /**
     * The original name goes out as RFC 6266's UTF-8 `filename*`, with an ASCII
     * `filename` for clients that do not read it; neither may hold a path
     * separator, and the ASCII one no `%`.
     */
    private function attachmentNamed(string $originalName): string
    {
        $name = str_replace(['/', '\\'], '_', $originalName);
        $ascii = str_replace(['%', '/', '\\'], '_', (string) preg_replace('/[^\x20-\x7E]/', '_', Str::ascii($name)));

        return HeaderUtils::makeDisposition(HeaderUtils::DISPOSITION_ATTACHMENT, $name, $ascii);
    }
}
