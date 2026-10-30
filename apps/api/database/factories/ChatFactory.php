<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Calendar\Models\Event;
use App\Modules\Chat\ChatType;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Chat> */
final class ChatFactory extends Factory
{
    protected $model = Chat::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return ['type' => ChatType::Group, 'title' => fake()->words(3, true), 'created_by_user_id' => User::factory()];
    }

    public function configure(): static
    {
        return $this->afterCreating(function (Chat $chat): void {
            if ($chat->type === ChatType::Group && $chat->created_by_user_id !== null) {
                ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $chat->created_by_user_id], ['is_owner' => true, 'joined_at' => now()]);
            }
        });
    }

    public function ministry(Ministry $ministry): static
    {
        return $this->state(fn (): array => ['type' => ChatType::Ministry, 'title' => null, 'ministry_id' => $ministry->id, 'event_id' => null, 'direct_key' => null]);
    }

    public function event(Event $event): static
    {
        return $this->state(fn (): array => ['type' => ChatType::Event, 'title' => null, 'event_id' => $event->id, 'ministry_id' => null, 'direct_key' => null]);
    }

    public function direct(User $a, User $b): static
    {
        return $this->state(fn (): array => ['type' => ChatType::Direct, 'created_by_user_id' => $a->id, 'title' => null, 'ministry_id' => null, 'event_id' => null, 'direct_key' => Chat::directKey($a->id, $b->id)])
            ->withMembers($a, $b);
    }

    public function archived(): static
    {
        return $this->state(fn (): array => ['archived_at' => now()]);
    }

    public function withMembers(User ...$users): static
    {
        return $this->afterCreating(function (Chat $chat) use ($users): void {
            foreach ($users as $user) {
                ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $user->id], ['is_owner' => $chat->type === ChatType::Group && $user->id === $chat->created_by_user_id, 'joined_at' => now()]);
            }
        });
    }
}
