<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Access\Models\AuditEntry;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<AuditEntry> */
final class AuditEntryFactory extends Factory
{
    protected $model = AuditEntry::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'actor_user_id' => null,
            'action' => fake()->randomElement([
                'person.archived',
                'role.created',
                'settings.changed',
            ]),
            'subject_type' => null,
            'subject_id' => null,
            'payload' => null,
            'ip' => fake()->ipv4(),
            'created_at' => now(),
        ];
    }
}
