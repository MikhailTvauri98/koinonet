<?php

declare(strict_types=1);

namespace App\Modules\Media\Actions;

use App\Modules\Directory\Models\User;
use App\Modules\Media\MediaStatus;
use App\Modules\Media\MediaUsage;
use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;
use App\Support\DomainRuleException;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

final readonly class SyncAttachments
{
    public function __construct(private MediaUsage $usage) {}

    /** @param list<string> $mediaIds Full ordered replacement, including retained files. */
    public function handle(Model $attachable, array $mediaIds, User $uploader): void
    {
        DB::transaction(function () use ($attachable, $mediaIds, $uploader): void {
            if (count($mediaIds) !== count(array_unique($mediaIds))) {
                throw DomainRuleException::because('media.duplicate', 'Список медиафайлов содержит повторения.');
            }

            // Serialize replacements even when the owner has no attachments yet.
            $attachable->newQuery()->whereKey($attachable->getKey())->lockForUpdate()->firstOrFail();
            $current = MediaAttachment::query()
                ->where('attachable_type', $attachable->getMorphClass())
                ->where('attachable_id', $attachable->getKey())
                ->get()->keyBy('media_id');

            // Use the same row lock as direct attachment/deletion/pruning. Lock in
            // stable order and validate the whole request before removing anything.
            $idsToLock = array_values(array_unique([...$mediaIds, ...$current->keys()->all()]));
            sort($idsToLock);
            $media = [];
            foreach ($idsToLock as $id) {
                $media[$id] = Media::lockedFind($id);
            }
            foreach ($mediaIds as $id) {
                if ($current->has($id)) {
                    continue; // Another authorized editor may retain the author's file.
                }
                if (! $media[$id]->isUploadedBy($uploader->id)) {
                    throw DomainRuleException::because('media.not_owned', 'Файл загрузил другой аккаунт.');
                }
                if ($media[$id]->status !== MediaStatus::Ready) {
                    throw DomainRuleException::because('media.not_ready', 'Файл ещё не обработан или не прошёл обработку.');
                }
                if ($this->usage->isUsed($media[$id])) {
                    throw DomainRuleException::because('media.already_attached', 'Файл уже используется в другом месте.');
                }
            }

            foreach ($current as $id => $attachment) {
                if (in_array($id, $mediaIds, true)) {
                    continue;
                }
                $file = $media[$id];
                $disk = $file->disk;
                $paths = $file->storedPaths();
                $attachment->delete();
                $file->delete();
                // Capture paths now; the row is gone and the outer transaction
                // may still roll back. Bytes must survive until its final commit.
                DB::afterCommit(static fn () => Storage::disk($disk)->delete($paths));
            }
            foreach ($mediaIds as $position => $id) {
                if ($current->has($id)) {
                    $current->get($id)?->update(['sort_order' => $position]);
                } else {
                    MediaAttachment::query()->create([
                        'media_id' => $id,
                        'attachable_type' => $attachable->getMorphClass(),
                        'attachable_id' => $attachable->getKey(),
                        'sort_order' => $position,
                        'created_at' => now(),
                    ]);
                }
            }
            $attachable->unsetRelation('attachments');
        });
    }
}
