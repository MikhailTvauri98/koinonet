<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Actions;

use App\Modules\Announcements\MarkdownCleaner;
use App\Modules\Announcements\Models\Announcement;
use Illuminate\Support\Arr;

final readonly class UpdateAnnouncement
{
    public function __construct(private MarkdownCleaner $cleaner) {}

    /** @param array{title?: string, body?: string, pinned?: bool, hide_after?: string|null, notify_on_publish?: bool} $attributes */
    public function handle(Announcement $announcement, array $attributes): Announcement
    {
        $announcement->ensureNotArchived();
        $updates = Arr::only($attributes, ['title', 'body', 'hide_after', 'notify_on_publish']);
        if (array_key_exists('body', $attributes)) {
            $updates['body'] = $this->cleaner->clean($attributes['body']);
        }
        if (array_key_exists('pinned', $attributes)) {
            $updates['pinned_at'] = $attributes['pinned'] ? ($announcement->pinned_at ?? now()) : null;
        }
        $announcement->fill($updates)->save();

        return $announcement;
    }
}
