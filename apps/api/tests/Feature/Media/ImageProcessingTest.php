<?php

declare(strict_types=1);

use App\Modules\Media\Jobs\ImageProcessor;
use App\Modules\Media\Jobs\ProcessUploadedImage;
use App\Modules\Media\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Drivers\Imagick\Driver as ImagickDriver;
use Intervention\Image\ImageManager;
use Intervention\Image\Interfaces\ImageInterface;

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

it('marks the media failed when the file holds corrupt bytes', function (string $path, string $mime) {
    $media = Media::factory()->create(['status' => 'processing', 'path' => $path, 'mime' => $mime]);
    Storage::disk('media')->put($path, random_bytes(2048));

    ProcessUploadedImage::dispatchSync($media->id);

    expect($media->fresh()->status->value)->toBe('failed');
})->with([
    'jpeg' => ['2026/09/corrupt.jpg', 'image/jpeg'],
    'heic' => ['2026/09/corrupt.heic', 'image/heic'],
]);

/**
 * The image in the container reads HEIC but cannot write it, and no real
 * HEIC file can be produced locally: the manager decodes a real JPEG and
 * reports it as HEIC, exactly as Imagick's decoder labels a decoded HEIC.
 */
function imageProcessorReadingHeic(): ImageProcessor
{
    return new ImageProcessor(new class(new ImagickDriver) extends ImageManager
    {
        public function decodePath(string|Stringable $path): ImageInterface
        {
            $image = parent::decodePath($path);
            $image->origin()->setMediaType('image/heic');

            return $image;
        }
    });
}

it('converts a heic original to jpeg and drops the heic file', function () {
    app()->instance(ImageProcessor::class, imageProcessorReadingHeic());
    $media = Media::factory()->create([
        'status' => 'processing', 'path' => '2026/09/01JQZHEIC00000000000000000.heic', 'mime' => 'image/heic',
    ]);
    Storage::disk('media')->put($media->path, UploadedFile::fake()->image('photo.jpg', 300, 200)->getContent());

    ProcessUploadedImage::dispatchSync($media->id);
    $media->refresh();

    expect($media->status->value)->toBe('ready')
        ->and($media->path)->toBe('2026/09/01JQZHEIC00000000000000000.jpg')
        ->and($media->mime)->toBe('image/jpeg')
        ->and(getimagesize(Storage::disk('media')->path($media->path))['mime'] ?? null)->toBe('image/jpeg')
        ->and($media->variants)->toHaveKeys(['thumb', 'large']);

    Storage::disk('media')->assertMissing('2026/09/01JQZHEIC00000000000000000.heic');
});

it('refuses an image over the pixel limit before decoding it', function () {
    config(['media.max_image_pixels' => 100]);
    $decoded = new ArrayObject;
    app()->instance(ImageProcessor::class, new ImageProcessor(new class(new ImagickDriver, $decoded) extends ImageManager
    {
        public function __construct(ImagickDriver $driver, private ArrayObject $decoded)
        {
            parent::__construct($driver);
        }

        public function decodePath(string|Stringable $path): ImageInterface
        {
            $this->decoded->append((string) $path);

            return parent::decodePath($path);
        }
    }));
    $media = Media::factory()->create(['status' => 'processing', 'path' => '2026/09/wide.jpg']);
    Storage::disk('media')->put($media->path, UploadedFile::fake()->image('wide.jpg', 20, 20)->getContent());

    ProcessUploadedImage::dispatchSync($media->id);

    expect($media->fresh()->status->value)->toBe('failed')
        ->and($decoded->getArrayCopy())->toBe([]);
});
