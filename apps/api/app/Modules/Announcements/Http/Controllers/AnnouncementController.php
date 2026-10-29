<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Http\Controllers;

use App\Modules\Announcements\Actions\PublishAnnouncement;
use App\Modules\Announcements\Actions\UpdateAnnouncement;
use App\Modules\Announcements\AnnouncementScope;
use App\Modules\Announcements\Http\Requests\StoreAnnouncementRequest;
use App\Modules\Announcements\Http\Requests\UpdateAnnouncementRequest;
use App\Modules\Announcements\Http\Resources\AnnouncementResource;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

final class AnnouncementController
{
    public function store(StoreAnnouncementRequest $request, PublishAnnouncement $publish): JsonResponse
    {
        /** @var array{scope: string, ministry_id?: string|null, title: string, body: string, pinned?: bool, hide_after?: string|null, notify_on_publish?: bool} $attributes */
        $attributes = $request->validated();
        $attributes['scope'] = AnnouncementScope::from($attributes['scope']);
        Gate::authorize('create', [Announcement::class, $attributes['scope'], $attributes['ministry_id'] ?? null]);
        $author = $request->user();
        assert($author instanceof User);

        return (new AnnouncementResource($publish->handle($author, $attributes)))
            ->response()->setStatusCode(201);
    }

    public function update(UpdateAnnouncementRequest $request, Announcement $announcement, UpdateAnnouncement $update): AnnouncementResource
    {
        Gate::authorize('update', $announcement);
        /** @var array{title?: string, body?: string, pinned?: bool, hide_after?: string|null, notify_on_publish?: bool} $attributes */
        $attributes = $request->validated();

        return new AnnouncementResource($update->handle($announcement, $attributes));
    }
}
