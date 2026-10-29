<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Http\Resources;

use App\Modules\Announcements\AnnouncementScope;
use App\Modules\Announcements\Models\Announcement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Http\Resources\MissingValue;
use Illuminate\Support\Facades\Gate;

/** @mixin Announcement */
final class AnnouncementResource extends JsonResource
{
    /**
     * @return array{
     *   id: string, scope: AnnouncementScope, ministry: array{id: string, name: string}|null,
     *   author: array{id: string, full_name: string}|null, title: string, body: string,
     *   pinned: bool, hide_after: string|null, notify_on_publish: bool, published_at: string,
     *   archived: bool, attachments: list<never>, views_count: int|MissingValue
     * }
     */
    public function toArray(Request $request): array
    {
        $announcement = $this->resource;
        assert($announcement instanceof Announcement);
        $ministry = $announcement->ministry;
        $author = $announcement->author;

        return [
            'id' => $announcement->id,
            'scope' => $announcement->scope,
            'ministry' => $ministry === null ? null : ['id' => $ministry->id, 'name' => $ministry->name],
            'author' => $author === null ? null : ['id' => $author->id, 'full_name' => $author->person->fullName()],
            'title' => $announcement->title,
            'body' => $announcement->body,
            'pinned' => $announcement->pinned_at !== null,
            /** @format date */
            'hide_after' => $announcement->hide_after?->toDateString(),
            'notify_on_publish' => $announcement->notify_on_publish,
            /** @format date-time */
            'published_at' => (string) $announcement->published_at->toISOString(),
            'archived' => $announcement->archived_at !== null,
            'views_count' => $this->when(
                Gate::allows('update', $announcement),
                fn (): int => $announcement->views_count ?? $announcement->views()->count(),
            ),
            'attachments' => [],
        ];
    }
}
