<?php

declare(strict_types=1);

use App\Modules\Media\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(fn () => Storage::fake('media'));

it('prunes unattached media older than a day', function () {
    $user = actingAsUser();
    $old = Media::factory()->create([
        'uploader_user_id' => $user->id, 'created_at' => now()->subDays(2), 'path' => '2026/09/old.jpg',
    ]);
    $fresh = Media::factory()->create(['uploader_user_id' => $user->id, 'created_at' => now()->subHour()]);
    Storage::disk('media')->put('2026/09/old.jpg', 'bytes');

    $this->artisan('media:prune')->assertSuccessful();

    expect(Media::query()->find($old->id))->toBeNull()
        ->and(Media::query()->find($fresh->id))->not->toBeNull();

    Storage::disk('media')->assertMissing('2026/09/old.jpg');
});

it('keeps a directly referenced photo even when unattached', function () {
    $user = actingAsUser();
    $media = Media::factory()->create([
        'uploader_user_id' => $user->id, 'kind' => 'image', 'created_at' => now()->subDays(2),
    ]);
    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id]);

    $this->artisan('media:prune');

    expect(Media::query()->find($media->id))->not->toBeNull();
});
