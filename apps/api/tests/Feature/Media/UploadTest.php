<?php

declare(strict_types=1);

use App\Modules\Media\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Bus;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(function () {
    Storage::fake('media');
    // An image upload queues ProcessUploadedImage. Faked here so
    // these tests observe the upload's own immediate result - `processing`,
    // not whatever the sync test queue turns it into a moment later. The
    // job itself is exercised in ImageProcessingTest.php.
    Bus::fake();
});

it('requires a session to upload', function () {
    $this->postJson('/api/v1/media', ['file' => UploadedFile::fake()->image('photo.jpg')])
        ->assertStatus(401);
});

it('stores an image under a year and month path', function () {
    actingAsUser();

    $response = $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('photo.jpg', 800, 600),
        'purpose' => 'person_photo',
    ])->assertCreated();

    $media = Media::query()->sole();
    expect($media->kind->value)->toBe('image')
        ->and($media->status->value)->toBe('processing')
        ->and($media->path)->toMatch('#^\d{4}/\d{2}/[0-9A-Z]{26}\.jpg$#')
        ->and($response->json('data.id'))->toBe($media->id);

    Storage::disk('media')->assertExists($media->path);
});

it('marks a document as ready immediately', function () {
    actingAsUser();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf'),
        'purpose' => 'message',
    ])->assertCreated();

    expect(Media::query()->sole()->status->value)->toBe('ready');
});

it('rejects a disallowed type', function () {
    actingAsUser();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('script.exe', 10, 'application/x-msdownload'),
        'purpose' => 'message',
    ])->assertStatus(422)->assertJsonPath('code', 'media.type_not_allowed');
});

it('rejects a type that lies about its extension', function () {
    actingAsUser();
    $file = UploadedFile::fake()->create('photo.jpg', 10, 'application/x-msdownload');

    $this->postJson('/api/v1/media', ['file' => $file, 'purpose' => 'message'])
        ->assertStatus(422)->assertJsonPath('code', 'media.type_not_allowed');
});

it('rejects an image over ten megabytes', function () {
    actingAsUser();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('big.jpg')->size(11 * 1024),
        'purpose' => 'message',
    ])->assertStatus(422)->assertJsonPath('code', 'media.too_large');
});

it('allows a fifty megabyte document but not a sixty megabyte one', function () {
    actingAsUser();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('big.pdf', 50 * 1024, 'application/pdf'),
        'purpose' => 'message',
    ])->assertCreated();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('bigger.pdf', 60 * 1024, 'application/pdf'),
        'purpose' => 'message',
    ])->assertStatus(422)->assertJsonPath('code', 'media.too_large');
});

it('rejects heic with a clear message when libheif is missing', function () {
    actingAsUser();
    config(['media.heic_supported' => false]);

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->create('photo.heic', 100, 'image/heic'),
        'purpose' => 'person_photo',
    ])->assertStatus(422)->assertJsonPath('code', 'media.heic_unsupported');
});

it('remembers who uploaded the file', function () {
    $user = actingAsUser();

    $this->postJson('/api/v1/media', [
        'file' => UploadedFile::fake()->image('photo.jpg'), 'purpose' => 'person_photo',
    ]);

    expect(Media::query()->sole()->uploader_user_id)->toBe($user->id);
});
