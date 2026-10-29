<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\PushSubscription;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<PushSubscription> */
final class PushSubscriptionFactory extends Factory
{
    protected $model = PushSubscription::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'user_id' => User::factory(),
            'endpoint' => 'https://push.example.test/'.fake()->unique()->uuid(),
            'public_key' => rtrim(strtr(base64_encode("\x04".random_bytes(64)), '+/', '-_'), '='),
            'auth_token' => rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '='),
            'content_encoding' => 'aes128gcm',
        ];
    }
}
