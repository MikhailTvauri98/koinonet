<?php

declare(strict_types=1);

namespace App\Modules\Directory\Contracts;

interface SharedMinistryFinder
{
    /** @return list<string> */
    public function sharedMinistryIds(string $viewerPersonId, string $subjectPersonId): array;
}
