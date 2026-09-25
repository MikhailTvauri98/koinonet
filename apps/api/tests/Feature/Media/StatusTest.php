<?php

declare(strict_types=1);

use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('requires a session to read the status', function () {
    $media = Media::factory()->create();

    $this->getJson("/api/v1/media/{$media->id}/status")->assertStatus(401);
});

it('lets the uploader watch its own file move from processing to ready', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'status' => 'processing']);

    $this->getJson("/api/v1/media/{$media->id}/status")
        ->assertOk()
        ->assertJsonPath('data.id', $media->id)
        ->assertJsonPath('data.status', 'processing');

    $media->forceFill(['status' => 'ready'])->save();

    $this->getJson("/api/v1/media/{$media->id}/status")
        ->assertOk()
        ->assertJsonPath('data.status', 'ready');
});

it('gives another account the exact same refusal as a nonexistent id', function () {
    $other = User::factory()->create();
    $media = Media::factory()->create(['uploader_user_id' => $other->id]);
    actingAsUser();

    $forbidden = $this->getJson("/api/v1/media/{$media->id}/status")->assertStatus(403);
    $missing = $this->getJson('/api/v1/media/01ARZ3NDEKTSV4RRFFQ69G5FAV/status')->assertStatus(403);

    // Same message, not just the same status code: an oracle would still
    // leak through a message that differs between "forbidden" and "not
    // found" (the two responses' own debug traces differ by call site, so
    // comparing full bodies would fail for a reason that has nothing to do
    // with the leak this test actually guards against).
    expect($forbidden->json('message'))->toBe($missing->json('message'))
        ->and($forbidden->json('data'))->toBeNull()
        ->and($missing->json('data'))->toBeNull();
});

it('shows a person their own already-attached photo status without people.view', function () {
    $person = Person::factory()->create();
    $media = Media::factory()->create(['status' => 'ready']);
    $person->forceFill(['photo_media_id' => $media->id])->save();

    actingAsUser($person);

    $this->getJson("/api/v1/media/{$media->id}/status")->assertOk();
});
