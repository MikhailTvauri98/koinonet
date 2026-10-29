<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Http\Controllers;

use App\Modules\Announcements\Actions\ArchiveAnnouncement;
use App\Modules\Announcements\Actions\PinAnnouncement;
use App\Modules\Announcements\Actions\PublishAnnouncement;
use App\Modules\Announcements\Actions\RecordAnnouncementView;
use App\Modules\Announcements\Actions\UnpinAnnouncement;
use App\Modules\Announcements\Actions\UpdateAnnouncement;
use App\Modules\Announcements\AnnouncementScope;
use App\Modules\Announcements\Http\Queries\AnnouncementIndexQuery;
use App\Modules\Announcements\Http\Requests\IndexAnnouncementRequest;
use App\Modules\Announcements\Http\Requests\StoreAnnouncementRequest;
use App\Modules\Announcements\Http\Requests\UpdateAnnouncementRequest;
use App\Modules\Announcements\Http\Resources\AnnouncementResource;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

final class AnnouncementController
{
    public function index(IndexAnnouncementRequest $request, AnnouncementIndexQuery $query): AnonymousResourceCollection
    {
        $viewer = $request->user();
        assert($viewer instanceof User);
        /** @var array{scope?: string, ministry?: string, per_page?: int, page?: int} $filters */
        $filters = $request->validated();

        return AnnouncementResource::collection($query->for($viewer, $filters['scope'] ?? null, $filters['ministry'] ?? null)
            ->paginate($filters['per_page'] ?? 20)->withQueryString());
    }

    public function show(Request $request, Announcement $announcement, RecordAnnouncementView $recordView): AnnouncementResource
    {
        abort_if($announcement->archived_at !== null && Gate::denies('update', $announcement), 404);
        Gate::authorize('view', $announcement);
        $viewer = $request->user();
        assert($viewer instanceof User);
        $recordView->handle($announcement, $viewer);

        return new AnnouncementResource($announcement->load(['ministry', 'author.person'])->loadCount('views'));
    }

    public function pin(Announcement $announcement, PinAnnouncement $pin): AnnouncementResource
    {
        Gate::authorize('update', $announcement);

        return new AnnouncementResource($pin->handle($announcement));
    }

    public function unpin(Announcement $announcement, UnpinAnnouncement $unpin): AnnouncementResource
    {
        Gate::authorize('update', $announcement);

        return new AnnouncementResource($unpin->handle($announcement));
    }

    public function archive(Announcement $announcement, ArchiveAnnouncement $archive): AnnouncementResource
    {
        Gate::authorize('update', $announcement);

        return new AnnouncementResource($archive->handle($announcement));
    }

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
