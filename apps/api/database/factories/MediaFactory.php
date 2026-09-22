<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Modules\Directory\Models\User;
use App\Modules\Media\MediaKind;
use App\Modules\Media\MediaStatus;
use App\Modules\Media\Models\Media;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Media> */
final class MediaFactory extends Factory
{
    protected $model = Media::class;

    /** @return array<string, mixed> */
    public function definition(): array
    {
        return [
            'uploader_user_id' => User::factory(),
            'disk' => 'media',
            'path' => sprintf('%s/%s.jpg', now()->format('Y/m'), (string) Str::ulid()),
            'original_name' => 'photo.jpg',
            'mime' => 'image/jpeg',
            'size' => fake()->numberBetween(50_000, 2_000_000),
            'kind' => MediaKind::Image,
            'width' => 1600,
            'height' => 1200,
            'variants' => null,
            'status' => MediaStatus::Ready,
            'created_at' => now(),
        ];
    }
}
