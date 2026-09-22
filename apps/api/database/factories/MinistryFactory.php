<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionScope;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Ministry> */
final class MinistryFactory extends Factory
{
    protected $model = Ministry::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'name' => fake()->unique()->words(2, true),
            'description' => null,
            'cover_media_id' => null,
            'default_role_id' => null,
            'archived_at' => null,
        ];
    }

    /** A ministry always carries the two roles CreateMinistry gives it, and a default role. */
    public function configure(): static
    {
        return $this->afterCreating(function (Ministry $ministry): void {
            Role::factory()
                ->ministry($ministry->id)
                ->withPermissions(Permission::ofScope(PermissionScope::Ministry))
                ->create(['name' => 'Лидер']);

            $member = Role::factory()->ministry($ministry->id)->create(['name' => 'Участник']);

            $ministry->forceFill(['default_role_id' => $member->id])->save();
        });
    }

    public function archived(): static
    {
        return $this->state(fn (): array => ['archived_at' => now()]);
    }
}
