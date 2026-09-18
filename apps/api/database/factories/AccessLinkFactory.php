<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Directory\AccessLinkKind;
use App\Modules\Directory\Models\AccessLink;
use App\Modules\Directory\Models\Person;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<AccessLink> */
final class AccessLinkFactory extends Factory
{
    protected $model = AccessLink::class;

    /** @var array<string, string> */
    private static array $plainTokensByHash = [];

    public function configure(): static
    {
        return $this->afterMaking(function (AccessLink $link): void {
            $link->plain_token = self::$plainTokensByHash[$link->token_hash];
        });
    }

    /** @return array<string, mixed> */
    public function definition(): array
    {
        $token = Str::random(48);
        $hash = hash('sha256', $token);
        self::$plainTokensByHash[$hash] = $token;

        return [
            'person_id' => Person::factory(),
            'kind' => AccessLinkKind::Invite,
            'token_hash' => $hash,
            'created_by_user_id' => null,
            'expires_at' => now()->addDays(7),
            'used_at' => null,
            'revoked_at' => null,
            'created_at' => now(),
        ];
    }

    public function kind(AccessLinkKind $kind): static
    {
        return $this->state(fn (): array => ['kind' => $kind]);
    }

    public function used(): static
    {
        return $this->state(fn (): array => ['used_at' => now()]);
    }

    public function expired(): static
    {
        return $this->state(fn (): array => ['expires_at' => now()->subMinute()]);
    }

    public function revoked(): static
    {
        return $this->state(fn (): array => ['revoked_at' => now()]);
    }
}
