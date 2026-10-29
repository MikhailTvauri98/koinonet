<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Http\Queries;

use App\Modules\Announcements\AnnouncementVisibility;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use App\Modules\Settings\ChurchSettings;
use Illuminate\Database\Eloquent\Builder;

final readonly class AnnouncementIndexQuery
{
    public function __construct(private AnnouncementVisibility $visibility, private ChurchSettings $settings) {}

    /** @return Builder<Announcement> */
    public function for(User $viewer, ?string $scope = null, ?string $ministryId = null): Builder
    {
        $today = now($this->settings->timezone())->toDateString();
        $query = Announcement::query()
            ->whereNull('archived_at')
            ->where(fn (Builder $dates): Builder => $dates->whereNull('hide_after')->orWhere('hide_after', '>=', $today));

        return $this->visibility->constrainActiveQuery($query, $viewer)
            ->when($scope !== null, fn (Builder $filtered): Builder => $filtered->where('scope', $scope))
            ->when($ministryId !== null, fn (Builder $filtered): Builder => $filtered->where('ministry_id', $ministryId))
            ->with(['ministry', 'author.person', 'attachments.media'])
            ->withCount('views')
            ->orderByRaw('pinned_at IS NULL')
            ->orderByDesc('pinned_at')
            ->orderByDesc('published_at')
            ->orderByDesc('id');
    }
}
