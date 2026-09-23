<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Media\Models\Media;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;

uses(RefreshDatabase::class);

beforeEach(fn () => Storage::fake('media'));

it('sets ones own photo without any permission', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);

    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id])->assertOk();

    expect($user->person->fresh()->photo_media_id)->toBe($media->id);
});

it('refuses a media file uploaded by someone else', function () {
    actingAsUser();
    $media = Media::factory()->create();

    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id])
        ->assertStatus(422)->assertJsonPath('code', 'media.not_owned');
});

it('refuses a document as a photo', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'file']);

    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id])
        ->assertStatus(422)->assertJsonPath('code', 'media.wrong_kind');
});

it('refuses a media file already attached elsewhere', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);
    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id]);

    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id])
        ->assertStatus(422)->assertJsonPath('code', 'media.already_attached');
});

it('sets another persons photo with people.manage', function () {
    $user = actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->create();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);

    $this->putJson("/api/v1/people/{$person->id}/photo", ['media_id' => $media->id])->assertOk();
});

it('sets a ministry cover with ministry.edit', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUserWith([Permission::MinistriesManageAll]);
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);

    $this->putJson("/api/v1/ministries/{$ministry->id}/cover", ['media_id' => $media->id])->assertOk();

    expect($ministry->fresh()->cover_media_id)->toBe($media->id);
});

it('refuses to set a photo on an archived person', function () {
    $user = actingAsUserWith([Permission::PeopleManage]);
    $person = Person::factory()->archived()->create();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);

    $this->putJson("/api/v1/people/{$person->id}/photo", ['media_id' => $media->id])
        ->assertStatus(422)->assertJsonPath('code', 'person.archived');
});

it('refuses to set a cover on an archived ministry', function () {
    $user = actingAsUserWith([Permission::MinistriesManageAll]);
    $ministry = Ministry::factory()->archived()->create();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);

    $this->putJson("/api/v1/ministries/{$ministry->id}/cover", ['media_id' => $media->id])
        ->assertStatus(422)->assertJsonPath('code', 'ministry.archived');
});

it('lets an account delete its own unattached file', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'path' => '2026/09/a.jpg']);
    Storage::disk('media')->put('2026/09/a.jpg', 'bytes');

    $this->deleteJson("/api/v1/media/{$media->id}")->assertNoContent();

    expect(Media::query()->find($media->id))->toBeNull();
    Storage::disk('media')->assertMissing('2026/09/a.jpg');
});

it('refuses to delete an attached file', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'image']);
    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id]);

    $this->deleteJson("/api/v1/media/{$media->id}")
        ->assertStatus(422)->assertJsonPath('code', 'media.already_attached');
});

it('refuses to delete someone elses file', function () {
    actingAsUser();
    $media = Media::factory()->create();

    $this->deleteJson("/api/v1/media/{$media->id}")
        ->assertStatus(422)->assertJsonPath('code', 'media.not_owned');
});
