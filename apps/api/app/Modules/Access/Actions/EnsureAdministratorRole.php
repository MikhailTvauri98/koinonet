<?php

declare(strict_types=1);

namespace App\Modules\Access\Actions;

use App\Modules\Access\Models\Role;
use App\Modules\Access\RoleScope;

final readonly class EnsureAdministratorRole
{
    public function handle(): Role
    {
        $existing = Role::query()->where('is_system', true)->first();

        if ($existing !== null) {
            return $existing;
        }

        return Role::query()->create([
            'scope' => RoleScope::Global,
            'ministry_id' => null,
            'name' => 'Администратор',
            'description' => null,
            'is_system' => true,
        ]);
    }
}
