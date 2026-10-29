<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Actions;

use App\Modules\Announcements\AnnouncementScope;
use App\Modules\Announcements\Events\AnnouncementPublished;
use App\Modules\Announcements\MarkdownCleaner;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Actions\SyncAttachments;
use Illuminate\Support\Facades\DB;

final readonly class PublishAnnouncement
{
    public function __construct(private MarkdownCleaner $cleaner, private SyncAttachments $attachments) {}

    /** @param array{scope: AnnouncementScope, ministry_id?: string|null, title: string, body: string, pinned?: bool, hide_after?: string|null, notify_on_publish?: bool, media_ids?: list<string>} $attributes */
    public function handle(User $author, array $attributes): Announcement
    {
        return DB::transaction(function () use ($author, $attributes): Announcement {
            $announcement = Announcement::query()->create([
                'scope' => $attributes['scope'],
                'ministry_id' => $attributes['ministry_id'] ?? null,
                'author_user_id' => $author->id,
                'title' => $attributes['title'],
                'body' => $this->cleaner->clean($attributes['body']),
                'pinned_at' => ($attributes['pinned'] ?? false) ? now() : null,
                'hide_after' => $attributes['hide_after'] ?? null,
                'notify_on_publish' => $attributes['notify_on_publish'] ?? true,
                'published_at' => now(),
            ]);
            $this->attachments->handle($announcement, $attributes['media_ids'] ?? [], $author);
            AnnouncementPublished::dispatch($announcement->id);

            return $announcement;
        });
    }
}
