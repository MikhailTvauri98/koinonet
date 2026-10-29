<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Actions;

use App\Modules\Announcements\MarkdownCleaner;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Actions\SyncAttachments;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;

final readonly class UpdateAnnouncement
{
    public function __construct(private MarkdownCleaner $cleaner, private SyncAttachments $attachments) {}

    /** @param array{title?: string, body?: string, pinned?: bool, hide_after?: string|null, notify_on_publish?: bool, media_ids?: list<string>} $attributes */
    public function handle(Announcement $announcement, array $attributes, User $editor): Announcement
    {
        return DB::transaction(function () use ($announcement, $attributes, $editor): Announcement {
            $announcement = Announcement::query()->whereKey($announcement->id)->lockForUpdate()->firstOrFail();
            $announcement->ensureNotArchived();
            $updates = Arr::only($attributes, ['title', 'body', 'hide_after', 'notify_on_publish']);
            if (array_key_exists('body', $attributes)) {
                $updates['body'] = $this->cleaner->clean($attributes['body']);
            }
            if (array_key_exists('pinned', $attributes)) {
                $updates['pinned_at'] = $attributes['pinned'] ? ($announcement->pinned_at ?? now()) : null;
            }
            $announcement->fill($updates)->save();
            if (array_key_exists('media_ids', $attributes)) {
                $this->attachments->handle($announcement, $attributes['media_ids'], $editor);
            }

            return $announcement;
        });
    }
}
