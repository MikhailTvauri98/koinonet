<?php

declare(strict_types=1);

namespace App\Modules\Access\Contracts;

interface RoleCarrierDetacher
{
    /**
     * Removes a role's links to every carrier who holds it. Called synchronously, inside the
     * same transaction as the role's own deletion: carrier tables reference roles with
     * composite foreign keys under ON DELETE RESTRICT, so the links must be gone first — a
     * queued listener would run too late to satisfy the constraint.
     */
    public function handle(string $roleId): void;
}
