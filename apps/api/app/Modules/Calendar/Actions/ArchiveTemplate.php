<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Actions;

use App\Modules\Calendar\Models\EventTemplate;
use Illuminate\Support\Facades\DB;

final class ArchiveTemplate
{
    public function handle(EventTemplate $template): EventTemplate
    {
        return DB::transaction(function () use ($template): EventTemplate {
            $template = EventTemplate::query()->lockForUpdate()->findOrFail($template->id);
            $template->fill(['archived_at' => $template->archived_at ?? now(), 'active' => false])->save();

            return $template;
        });
    }
}
