<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Announcements\AnnouncementScope;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Announcement> */
final class AnnouncementFactory extends Factory
{
    protected $model = Announcement::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'scope' => AnnouncementScope::Church,
            'ministry_id' => null,
            'author_user_id' => User::factory(),
            'title' => fake()->sentence(),
            'body' => fake()->paragraph(),
            'pinned_at' => null,
            'hide_after' => null,
            'notify_on_publish' => true,
            'published_at' => now(),
            'archived_at' => null,
        ];
    }

    public function ministry(Ministry $ministry): static
    {
        return $this->state(fn (): array => ['scope' => AnnouncementScope::Ministry, 'ministry_id' => $ministry->id]);
    }

    public function pinned(): static
    {
        return $this->state(fn (): array => ['pinned_at' => now()]);
    }

    public function archived(): static
    {
        return $this->state(fn (): array => ['archived_at' => now()]);
    }

    public function hiddenAfter(string $date): static
    {
        return $this->state(fn (): array => ['hide_after' => $date]);
    }
}
