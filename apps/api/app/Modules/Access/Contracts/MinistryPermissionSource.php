<?php

declare(strict_types=1);

namespace App\Modules\Access\Contracts;

interface MinistryPermissionSource
{
    /** @return array<string, list<string>> */
    public function forPerson(string $personId): array;
}
