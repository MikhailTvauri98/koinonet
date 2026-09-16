<?php

declare(strict_types=1);

namespace App\Modules\Access;

use App\Modules\Access\Contracts\MinistryPermissionSource;

final class EmptyMinistryPermissionSource implements MinistryPermissionSource
{
    public function forPerson(string $personId): array
    {
        return [];
    }
}
