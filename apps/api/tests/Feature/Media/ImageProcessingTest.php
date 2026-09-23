<?php

declare(strict_types=1);

use App\Modules\Media\Jobs\ProcessUploadedImage;
use App\Modules\Media\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(fn () => Storage::fake('media'));

it('queues processing for an image only', function () {
    Bus::fake();
    actingAsUser();

    $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->image('a.jpg'), 'purpose' => 'message']);
    Bus::assertDispatched(ProcessUploadedImage::class);

    Bus::fake();
    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('a.pdf', 10, 'application/pdf'), 'purpose' => 'message',
    ]);
    Bus::assertNotDispatched(ProcessUploadedImage::class);
});

it('downscales a large image and records its dimensions', function () {
    actingAsUser();
    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('a.jpg', 4000, 3000), 'purpose' => 'message',
    ]);

    $media = Media::query()->sole();
    ProcessUploadedImage::dispatchSync($media->id);
    $media->refresh();

    expect($media->width)->toBe(2000)
        ->and($media->height)->toBe(1500)
        ->and($media->status->value)->toBe('ready');
});

it('creates thumb and large webp variants', function () {
    actingAsUser();
    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('a.jpg', 4000, 3000), 'purpose' => 'message',
    ]);

    $media = Media::query()->sole();
    ProcessUploadedImage::dispatchSync($media->id);
    $media->refresh();

    expect($media->variants)->toHaveKeys(['thumb', 'large'])
        ->and($media->variants['thumb'])->toEndWith('.webp');

    Storage::disk('media')->assertExists($media->variants['thumb']);
    Storage::disk('media')->assertExists($media->variants['large']);
});

it('does not upscale a small image', function () {
    actingAsUser();
    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('a.jpg', 200, 150), 'purpose' => 'message',
    ]);

    $media = Media::query()->sole();
    ProcessUploadedImage::dispatchSync($media->id);

    expect($media->fresh()->width)->toBe(200);
});

it('marks the media failed when the file is not a readable image', function () {
    actingAsUser();
    $media = Media::factory()->create(['kind' => 'image', 'status' => 'processing', 'path' => '2026/09/missing.jpg']);

    ProcessUploadedImage::dispatchSync($media->id);

    expect($media->fresh()->status->value)->toBe('failed');
});
