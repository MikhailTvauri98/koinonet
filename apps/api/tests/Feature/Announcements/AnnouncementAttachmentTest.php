<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionCache;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Actions\SyncAttachments;
use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;
use Dedoc\Scramble\Generator;
use Illuminate\Database\Events\QueryExecuted;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

uses(RefreshDatabase::class);

beforeEach(fn () => Storage::fake('media'));

function attachmentAnnouncement(array $over = []): array
{
    return ['scope' => 'church', 'title' => 'Собрание', 'body' => 'В воскресенье', ...$over];
}

it('publishes attachments in request order and returns them from lists and direct reads', function () {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $a = Media::factory()->create(['uploader_user_id' => $user->id]);
    $b = Media::factory()->create(['uploader_user_id' => $user->id, 'kind' => 'file', 'mime' => 'application/pdf']);
    $id = $this->postJson('/api/v1/announcements', attachmentAnnouncement(['media_ids' => [$b->id, $a->id]]))
        ->assertCreated()->assertJsonPath('data.attachments.0.id', $b->id)
        ->assertJsonPath('data.attachments.1.id', $a->id)->json('data.id');

    expect(MediaAttachment::query()->orderBy('sort_order')->pluck('media_id')->all())->toBe([$b->id, $a->id])
        ->and(MediaAttachment::query()->pluck('attachable_type')->unique()->all())->toBe(['announcement'])
        ->and($user->getMorphClass())->toBe(User::class);
    $this->getJson("/api/v1/announcements/{$id}")->assertOk()->assertJsonPath('data.attachments.0.id', $b->id);
    $this->getJson('/api/v1/announcements')->assertOk()->assertJsonPath('data.0.attachments.1.id', $a->id);
});

it('refuses new media from another account and rolls back publication', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $foreign = Media::factory()->create();
    $this->postJson('/api/v1/announcements', attachmentAnnouncement(['media_ids' => [$foreign->id]]))
        ->assertUnprocessable()->assertJsonPath('code', 'media.not_owned');
    expect(Announcement::query()->count())->toBe(0)->and(MediaAttachment::query()->count())->toBe(0);
});

it('refuses unready new media', function (string $status) {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $media = Media::factory()->create(['uploader_user_id' => $user->id, 'status' => $status]);
    $this->postJson('/api/v1/announcements', attachmentAnnouncement(['media_ids' => [$media->id]]))
        ->assertUnprocessable()->assertJsonPath('code', 'media.not_ready');
    expect(Announcement::query()->count())->toBe(0);
})->with(['processing', 'failed']);

it('refuses media used by an announcement or a direct photo', function (string $owner) {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $media = Media::factory()->create(['uploader_user_id' => $user->id]);
    if ($owner === 'announcement') {
        $this->postJson('/api/v1/announcements', attachmentAnnouncement(['media_ids' => [$media->id]]))->assertCreated();
    } else {
        $this->putJson('/api/v1/me/photo', ['media_id' => $media->id])->assertOk();
    }
    $this->postJson('/api/v1/announcements', attachmentAnnouncement(['media_ids' => [$media->id]]))
        ->assertUnprocessable()->assertJsonPath('code', 'media.already_attached');
})->with(['announcement', 'photo']);

it('preserves direct attach and delete protection for announcement media', function () {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $media = Media::factory()->create(['uploader_user_id' => $user->id]);
    $this->postJson('/api/v1/announcements', attachmentAnnouncement(['media_ids' => [$media->id]]))->assertCreated();
    $this->putJson('/api/v1/me/photo', ['media_id' => $media->id])
        ->assertUnprocessable()->assertJsonPath('code', 'media.already_attached');
    $this->deleteJson("/api/v1/media/{$media->id}")
        ->assertUnprocessable()->assertJsonPath('code', 'media.already_attached');
});

it('validates a distinct list of existing ULIDs on create and update', function (string $case) {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $media = Media::factory()->create(['uploader_user_id' => $user->id]);
    $invalid = match ($case) {
        'duplicate' => [$media->id, $media->id],
        'unknown' => ['01ARZ3NDEKTSV4RRFFQ69G5FAV'],
        'malformed' => ['bad'],
        'object' => ['key' => $media->id],
        'null' => null,
    };
    $this->postJson('/api/v1/announcements', attachmentAnnouncement(['media_ids' => $invalid]))->assertUnprocessable();
    $announcement = Announcement::factory()->create();
    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['media_ids' => $invalid])->assertUnprocessable();
    expect(MediaAttachment::query()->count())->toBe(0);
})->with(['duplicate', 'unknown', 'malformed', 'object', 'null']);

it('keeps omitted attachments and allows another authorized editor to retain and reorder them', function () {
    $author = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $a = Media::factory()->create(['uploader_user_id' => $author->id]);
    $b = Media::factory()->create(['uploader_user_id' => $author->id]);
    $id = $this->postJson('/api/v1/announcements', attachmentAnnouncement(['media_ids' => [$a->id, $b->id]]))->assertCreated()->json('data.id');
    auth()->forgetGuards();
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $this->patchJson("/api/v1/announcements/{$id}", ['title' => 'Правка'])
        ->assertOk()->assertJsonPath('data.attachments.0.id', $a->id)->assertJsonCount(2, 'data.attachments');
    $this->patchJson("/api/v1/announcements/{$id}", ['media_ids' => [$b->id, $a->id]])
        ->assertOk()->assertJsonPath('data.attachments.0.id', $b->id)->assertJsonPath('data.attachments.1.id', $a->id);
});

it('preserves the previous title relations original and variants on invalid replacement', function () {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $old = Media::factory()->create(['uploader_user_id' => $user->id, 'variants' => ['thumb' => 'old_thumb.webp']]);
    foreach ($old->storedPaths() as $path) {
        Storage::disk('media')->put($path, 'original bytes');
    }
    $id = $this->postJson('/api/v1/announcements', attachmentAnnouncement(['media_ids' => [$old->id]]))->assertCreated()->json('data.id');
    $new = Media::factory()->create(['uploader_user_id' => $user->id]);
    $foreign = Media::factory()->create();
    $this->patchJson("/api/v1/announcements/{$id}", ['title' => 'Не сохранять', 'media_ids' => [$new->id, $foreign->id]])
        ->assertUnprocessable()->assertJsonPath('code', 'media.not_owned');
    expect(Announcement::query()->findOrFail($id)->title)->toBe('Собрание')
        ->and(MediaAttachment::query()->pluck('media_id')->all())->toBe([$old->id])
        ->and(Media::query()->whereKey($old->id)->exists())->toBeTrue();
    foreach ($old->storedPaths() as $path) {
        expect(Storage::disk('media')->get($path))->toBe('original bytes');
    }
});

it('locks every desired media row before changing any attachment', function () {
    $user = actingAsUser();
    $announcement = Announcement::factory()->create();
    $a = Media::factory()->create(['uploader_user_id' => $user->id]);
    $b = Media::factory()->create(['uploader_user_id' => $user->id]);
    $locked = [];
    $writes = [];
    DB::listen(function (QueryExecuted $query) use (&$locked, &$writes): void {
        if (str_contains($query->sql, 'from "media"') && str_contains($query->sql, 'for update')) {
            $locked[] = $query->bindings[0];
            expect(DB::transactionLevel())->toBeGreaterThan(0);
        }
        if (str_starts_with($query->sql, 'insert into "media_attachments"')) {
            $writes[] = $locked;
        }
    });
    app(SyncAttachments::class)->handle($announcement, [$b->id, $a->id], $user);
    expect($locked)->toEqualCanonicalizing([$a->id, $b->id])->and($writes)->toHaveCount(2);
    foreach ($writes as $beforeWrite) {
        expect($beforeWrite)->toEqualCanonicalizing([$a->id, $b->id]);
    }
});

it('uses announcement visibility for both signed download and processing status', function (string $access) {
    $ministry = ministryWithRoles();
    $publisher = actingAsUserWith([Permission::MinistriesManageAll]);
    $media = Media::factory()->create(['uploader_user_id' => $publisher->id]);
    $id = $this->postJson('/api/v1/announcements', attachmentAnnouncement([
        'scope' => 'ministry', 'ministry_id' => $ministry->id, 'media_ids' => [$media->id], 'hide_after' => '2000-01-01',
    ]))->assertCreated()->json('data.id');
    if (str_starts_with($access, 'archived')) {
        $this->postJson("/api/v1/announcements/{$id}/archive")->assertOk();
    }
    // Remove both authorship and publishing permission from the original uploader.
    if ($access === 'uploader-denied') {
        Announcement::query()->whereKey($id)->update(['author_user_id' => null]);
        $publisher->person->globalRoles()->detach();
        app(PermissionCache::class)->bump($publisher->id);
    } else {
        auth()->forgetGuards();
        $reader = match ($access) {
            'view-all', 'archived-reader' => actingAsUserWith([Permission::MinistriesViewAll]),
            'manager', 'archived-manager' => actingAsUserWith([Permission::MinistriesManageAll]),
            default => actingAsUser(),
        };
        if ($access === 'member') {
            memberOf($ministry, $reader->person);
        }
    }
    $allowed = in_array($access, ['member', 'view-all', 'manager', 'archived-manager'], true);
    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))->assertStatus($allowed ? 200 : 403);
    $this->getJson("/api/v1/media/{$media->id}/status")->assertStatus($allowed ? 200 : 403);
})->with(['member', 'view-all', 'manager', 'outsider', 'uploader-denied', 'archived-reader', 'archived-manager']);

it('serves a church attachment to an account without publishing rights', function () {
    $publisher = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $media = Media::factory()->create(['uploader_user_id' => $publisher->id]);
    $this->postJson('/api/v1/announcements', attachmentAnnouncement(['media_ids' => [$media->id]]))->assertCreated();
    auth()->forgetGuards();
    actingAsUser();
    $this->get(URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]))->assertOk();
});

it('documents ordered media resources and distinct ULID lists', function () {
    $schema = app(Generator::class)();
    expect($schema['components']['schemas']['AnnouncementResource']['properties']['attachments']['items'])
        ->toBe(['$ref' => '#/components/schemas/MediaResource']);
    foreach (['StoreAnnouncementRequest', 'UpdateAnnouncementRequest'] as $request) {
        $ids = $schema['components']['schemas'][$request]['properties']['media_ids'];
        expect($ids['type'])->toBe('array')->and($ids['uniqueItems'])->toBeTrue()
            ->and($ids['items']['type'])->toBe('string')->and($ids['items']['format'])->toBe('ulid');
    }
});
