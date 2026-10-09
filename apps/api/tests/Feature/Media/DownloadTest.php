<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Contracts\MediaOwnerResolver;
use App\Modules\Media\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

uses(RefreshDatabase::class);

beforeEach(fn () => Storage::fake('media'));

it('refuses an unsigned url', function () {
    actingAsUser();
    $media = Media::factory()->create();

    $this->get("/api/v1/media/{$media->id}")->assertStatus(403);
});

it('refuses an unsigned request for a nonexistent id without revealing that', function () {
    actingAsUser();

    // A missing signature must be rejected before the id is ever looked up,
    // otherwise a real id (403, found but forbidden) becomes distinguishable
    // from a made-up one (404, not found) without presenting any signature
    // at all - an oracle for which media ids exist.
    $this->get('/api/v1/media/01ARZ3NDEKTSV4RRFFQ69G5FAV')->assertStatus(403);
});

it('refuses an expired signature', function () {
    actingAsUser();
    $media = Media::factory()->create();
    $url = URL::temporarySignedRoute('media.show', now()->subMinute(), ['media' => $media->id]);

    $this->get($url)->assertStatus(403);
});

it('serves the file through x-accel-redirect', function () {
    $user = actingAsUser();
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'path' => '2026/09/a.jpg']);
    Storage::disk('media')->put('2026/09/a.jpg', 'bytes');

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertOk()
        ->assertHeader('X-Accel-Redirect', '/_protected/2026/09/a.jpg')
        ->assertHeader('Content-Type', 'image/jpeg');
});

it('names a downloaded document by its original name in a form every browser reads', function () {
    $user = actingAsUser();
    $media = Media::factory()->create([
        'uploader_user_id' => $user->id,
        'kind' => 'file',
        'mime' => 'application/pdf',
        'path' => '2026/09/b.pdf',
        'original_name' => 'Отчёт.pdf',
    ]);

    $disposition = $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertOk()
        ->headers->get('Content-Disposition');

    // An ASCII name for old clients, then the UTF-8 name of RFC 6266 for the rest.
    expect($disposition)->toMatch(
        '/^attachment; filename=("[\x20-\x7E]*"|[^;\s]+); filename\*=utf-8\'\'%D0%9E%D1%82%D1%87%D1%91%D1%82\.pdf$/',
    );
});

it('asks the owner resolvers bound under media.owner_resolvers', function () {
    actingAsUser();
    // Uploaded by another account and used by no photo or cover: by default only its uploader sees it.
    $media = Media::factory()->create();
    app()->instance('tests.attachment_owner', new class implements MediaOwnerResolver
    {
        public function canView(User $user, Media $media): ?bool
        {
            return true;
        }
    });
    app()->tag(['tests.attachment_owner'], 'media.owner_resolvers');

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertOk();
});

it('serves a variant', function () {
    $user = actingAsUser();
    $media = Media::factory()->create([
        'uploader_user_id' => $user->id,
        'variants' => ['thumb' => '2026/09/a_thumb.webp'],
    ]);

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), [
        'media' => $media->id, 'variant' => 'thumb',
    ]))->assertHeader('X-Accel-Redirect', '/_protected/2026/09/a_thumb.webp');
});

it('hides an unattached file from another account', function () {
    $other = User::factory()->create();
    $media = Media::factory()->create(['uploader_user_id' => $other->id]);
    actingAsUser();

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertForbidden();
});

it('shows a person photo to anyone with people.view', function () {
    $person = Person::factory()->create();
    $media = Media::factory()->create();
    $person->forceFill(['photo_media_id' => $media->id])->save();

    actingAsUserWith([Permission::PeopleView]);

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertOk();
});

it('shows a person their own photo without people.view', function () {
    $person = Person::factory()->create();
    $media = Media::factory()->create();
    $person->forceFill(['photo_media_id' => $media->id])->save();

    actingAsUser($person);

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertOk();
});

it('hides a person photo from an account without people.view', function () {
    $person = Person::factory()->create();
    $media = Media::factory()->create();
    $person->forceFill(['photo_media_id' => $media->id])->save();

    actingAsUser();

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertForbidden();
});

it('shows a ministry cover to a member of that ministry', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    memberOf($ministry, $person);
    $media = Media::factory()->create();
    $ministry->forceFill(['cover_media_id' => $media->id])->save();

    actingAsUser($person);

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertOk();
});

it('hides a ministry cover from an account outside that ministry', function () {
    $ministry = ministryWithRoles();
    $media = Media::factory()->create();
    $ministry->forceFill(['cover_media_id' => $media->id])->save();

    actingAsUser();

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertForbidden();
});

it('shows a ministry cover to an account with ministries.view_all', function () {
    $ministry = ministryWithRoles();
    $media = Media::factory()->create();
    $ministry->forceFill(['cover_media_id' => $media->id])->save();

    actingAsUserWith([Permission::MinistriesViewAll]);

    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))
        ->assertOk();
});
