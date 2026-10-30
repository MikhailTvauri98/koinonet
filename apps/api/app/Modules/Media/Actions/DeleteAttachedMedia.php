<?php

declare(strict_types=1);

namespace App\Modules\Media\Actions;

use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

final readonly class DeleteAttachedMedia
{
    public function handle(Model $attachable): void
    {
        DB::transaction(function () use ($attachable): void {
            // Same owner-first and stable media lock order as SyncAttachments.
            $attachable->newQuery()->whereKey($attachable->getKey())->lockForUpdate()->firstOrFail();
            $attachments = MediaAttachment::query()->where('attachable_type', $attachable->getMorphClass())
                ->where('attachable_id', $attachable->getKey())->orderBy('media_id')->get();
            foreach ($attachments as $attachment) {
                $media = Media::lockedFind($attachment->media_id);
                $disk = $media->disk;
                $paths = $media->storedPaths();
                $attachment->delete();
                $media->delete();
                DB::afterCommit(static fn () => Storage::disk($disk)->delete($paths));
            }
            $attachable->unsetRelation('attachments');
        });
    }
}
