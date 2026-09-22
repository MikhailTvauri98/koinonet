<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Ministries\Events\MinistryArchived;
use App\Modules\Ministries\Models\Ministry;

final readonly class ArchiveMinistry
{
    public function __construct(private AuditLogger $audit) {}

    public function handle(Ministry $ministry): Ministry
    {
        $ministry->forceFill(['archived_at' => now()])->save();
        $this->audit->record('ministry.archived', $ministry, ['name' => $ministry->name]);
        MinistryArchived::dispatch($ministry->id);

        return $ministry;
    }
}
