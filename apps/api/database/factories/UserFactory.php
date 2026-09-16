<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;

/** @extends Factory<User> */
final class UserFactory extends Factory
{
    protected $model = User::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'person_id' => Person::factory(),
            'phone' => null,
            'email' => fake()->unique()->safeEmail(),
            'password' => Hash::make('password'),
            'last_login_at' => null,
            'disabled_at' => null,
        ];
    }
}
