<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Access\Models\Role;
use App\Modules\Access\RoleScope;
use BackedEnum;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\DB;

/** @extends Factory<Role> */
final class RoleFactory extends Factory
{
    protected $model = Role::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'scope' => RoleScope::Global,
            'ministry_id' => null,
            'name' => fake()->unique()->words(2, true),
            'description' => null,
            'is_system' => false,
        ];
    }

    public function global(): static
    {
        return $this->state(fn (): array => [
            'scope' => RoleScope::Global,
            'ministry_id' => null,
        ]);
    }

    public function system(): static
    {
        return $this->global()->state(fn (): array => ['is_system' => true]);
    }

    public function ministry(string $ministryId): static
    {
        return $this->state(fn (): array => [
            'scope' => RoleScope::Ministry,
            'ministry_id' => $ministryId,
        ]);
    }

    /** @param list<BackedEnum> $permissions */
    public function withPermissions(array $permissions): static
    {
        return $this->afterCreating(function (Role $role) use ($permissions): void {
            $rows = array_map(
                fn (BackedEnum $permission): array => [
                    'role_id' => $role->id,
                    'permission' => $permission->value,
                ],
                $permissions,
            );

            if ($rows !== []) {
                DB::table('role_permissions')->insert($rows);
            }
        });
    }
}
