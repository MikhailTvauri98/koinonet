<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Directory\Models\Person;
use App\Modules\Directory\PersonStatus;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Person> */
final class PersonFactory extends Factory
{
    protected $model = Person::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'last_name' => fake()->lastName(),
            'first_name' => fake()->firstName(),
            'patronymic' => null,
            'phone' => null,
            'email' => null,
            'birth_date' => null,
            'status' => PersonStatus::Attendee,
            'note' => null,
            'contacts_public' => false,
            'archived_at' => null,
        ];
    }

    public function archived(): static
    {
        return $this->state(fn (): array => ['archived_at' => now()]);
    }
}
