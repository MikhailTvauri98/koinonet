<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Message> */
final class MessageFactory extends Factory
{
    protected $model = Message::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return ['chat_id' => Chat::factory(), 'sender_user_id' => User::factory(), 'body' => fake()->sentence()];
    }

    public function from(User $user): static
    {
        return $this->state(fn (): array => ['sender_user_id' => $user->id]);
    }

    public function deleted(): static
    {
        return $this->state(fn (): array => ['deleted_at' => now(), 'body' => null, 'reply_to_id' => null]);
    }

    public function replyTo(Message $message): static
    {
        return $this->state(fn (): array => ['reply_to_id' => $message->id]);
    }

    public function at(CarbonImmutable $moment): static
    {
        return $this->state(fn (): array => ['created_at' => $moment->utc()]);
    }
}
