<?php

declare(strict_types=1);

namespace App\Modules\Directory;

use App\Modules\Directory\Contracts\SharedMinistryFinder;

final class NoSharedMinistryFinder implements SharedMinistryFinder
{
    public function sharedMinistryIds(string $viewerPersonId, string $subjectPersonId): array
    {
        return [];
    }
}
