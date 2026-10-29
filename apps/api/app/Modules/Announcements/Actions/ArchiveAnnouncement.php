<?php

declare(strict_types=1);

namespace App\Modules\Announcements\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Announcements\Models\Announcement;
use Illuminate\Support\Facades\DB;

final readonly class ArchiveAnnouncement
{
    public function __construct(private AuditLogger $audit) {}

    public function handle(Announcement $announcement): Announcement
    {
        return DB::transaction(function () use ($announcement): Announcement {
            $locked = Announcement::query()->lockForUpdate()->findOrFail($announcement->id);
            if ($locked->archived_at === null) {
                $locked->forceFill(['archived_at' => now()])->save();
                $this->audit->record('announcement.archived', $locked);
            }

            return $locked;
        });
    }
}
