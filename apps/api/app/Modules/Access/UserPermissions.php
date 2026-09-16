<?php

declare(strict_types=1);

namespace App\Modules\Access;

final readonly class UserPermissions
{
    /**
     * @param  list<string>  $global
     * @param  array<string, list<string>>  $ministries
     */
    public function __construct(
        public bool $administrator,
        public array $global,
        public array $ministries,
    ) {}
}
