<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\EventVisibility;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;

uses(RefreshDatabase::class);

beforeEach(fn () => Storage::fake('media'));

it('attaches ordered media on create and lists them on the card and calendar', function () {
    $user = actingAsUserWith([Permission::CalendarChurchManage]);
    $a = Media::factory()->create(['uploader_user_id' => $user->id]);
    $b = Media::factory()->create(['uploader_user_id' => $user->id]);
    $id = $this->postJson('/api/v1/events', [
        'owner_type' => 'church', 'title' => 'Т', 'starts_at' => '2026-11-08T07:00:00Z', 'ends_at' => '2026-11-08T09:00:00Z',
        'visibility' => 'church', 'media_ids' => [$b->id, $a->id],
    ])->assertCreated()->assertJsonPath('data.attachments.0.id', $b->id)->assertJsonPath('data.attachments.1.id', $a->id)->json('data.id');
    expect(MediaAttachment::query()->pluck('attachable_type')->unique()->all())->toBe(['event']);
    $this->getJson("/api/v1/events/{$id}")->assertOk()->assertJsonPath('data.attachments.0.id', $b->id);
    $this->getJson('/api/v1/events?from=2026-11-08&to=2026-11-08')->assertOk()->assertJsonPath('data.0.attachments.1.id', $a->id);
});

it('retains another editors attachments and replaces or clears them explicitly', function () {
    $author = actingAsUserWith([Permission::CalendarChurchManage]);
    $a = Media::factory()->create(['uploader_user_id' => $author->id]);
    $event = Event::factory()->create();
    $this->patchJson("/api/v1/events/{$event->id}", ['media_ids' => [$a->id]])->assertOk();
    auth()->forgetGuards();
    $editor = actingAsUserWith([Permission::CalendarChurchManage]);
    $b = Media::factory()->create(['uploader_user_id' => $editor->id]);
    $this->patchJson("/api/v1/events/{$event->id}", ['media_ids' => [$b->id, $a->id]])->assertOk()->assertJsonCount(2, 'data.attachments');
    $this->patchJson("/api/v1/events/{$event->id}", ['description' => 'Правка'])->assertOk()->assertJsonCount(2, 'data.attachments');
    $this->patchJson("/api/v1/events/{$event->id}", ['media_ids' => [$b->id]])->assertOk()->assertJsonPath('data.attachments.0.id', $b->id)->assertJsonCount(1, 'data.attachments');
    expect(Media::query()->find($a->id))->toBeNull();
    $this->patchJson("/api/v1/events/{$event->id}", ['media_ids' => []])->assertOk()->assertJsonCount(0, 'data.attachments');
    expect(Media::query()->find($b->id))->toBeNull();
});

it('rolls back event creation or edit for foreign unready and occupied media', function (string $case, string $code) {
    $user = actingAsUserWith([Permission::CalendarChurchManage]);
    $media = Media::factory()->create(['uploader_user_id' => $case === 'foreign' ? null : $user->id, 'status' => $case === 'unready' ? 'processing' : 'ready']);
    if ($case === 'occupied') {
        $this->putJson('/api/v1/me/photo', ['media_id' => $media->id])->assertOk();
    }
    $this->postJson('/api/v1/events', [
        'owner_type' => 'church', 'title' => 'Т', 'starts_at' => '2026-11-08T07:00:00Z', 'ends_at' => '2026-11-08T09:00:00Z',
        'visibility' => 'church', 'media_ids' => [$media->id],
    ])->assertUnprocessable()->assertJsonPath('code', $code);
    expect(Event::query()->count())->toBe(0);
    $event = Event::factory()->create(['title' => 'Прежнее']);
    $a = Media::factory()->create(['uploader_user_id' => $user->id]);
    $this->patchJson("/api/v1/events/{$event->id}", ['media_ids' => [$a->id]])->assertOk();
    $this->patchJson("/api/v1/events/{$event->id}", ['title' => 'Новое', 'media_ids' => [$media->id]])->assertUnprocessable()->assertJsonPath('code', $code);
    expect($event->refresh()->title)->toBe('Прежнее')->and(Media::query()->find($a->id))->not->toBeNull()
        ->and(MediaAttachment::query()->where('attachable_id', $event->id)->sole()->media_id)->toBe($a->id);
})->with([['foreign', 'media.not_owned'], ['unready', 'media.not_ready'], ['occupied', 'media.already_attached']]);

it('validates media ids as a distinct list of existing ULIDs', function (string $case) {
    $user = actingAsUserWith([Permission::CalendarChurchManage]);
    $media = Media::factory()->create(['uploader_user_id' => $user->id]);
    $ids = match ($case) {
        'duplicate' => [$media->id, $media->id],
        'unknown' => ['01ARZ3NDEKTSV4RRFFQ69G5FAV'],
        'malformed' => ['bad'],
        'object' => ['key' => $media->id],
        'null' => null,
    };
    $event = Event::factory()->create();
    $this->patchJson("/api/v1/events/{$event->id}", ['media_ids' => $ids])->assertUnprocessable();
})->with(['duplicate', 'unknown', 'malformed', 'object', 'null']);

it('serves attachments only to viewers of their event including assigned cancelled and archived history', function (string $visibility) {
    $ministry = ministryWithRoles();
    $manager = actingAsUserWith([Permission::MinistriesManageAll]);
    $media = Media::factory()->create(['uploader_user_id' => $manager->id]);
    $event = Event::factory()->ministry($ministry)->visibility(EventVisibility::from($visibility))->create();
    $this->patchJson("/api/v1/events/{$event->id}", ['media_ids' => [$media->id]])->assertOk();
    $url = URL::temporarySignedRoute('media.show', now()->addHour(), ['media' => $media->id]);
    auth()->forgetGuards();
    $viewer = actingAsUser();
    if ($visibility === 'ministry') {
        memberOf($ministry, $viewer->person);
    } elseif ($visibility === 'assigned') {
        EventAssignment::factory()->for(EventSlot::factory()->for($event)->create())->create(['person_id' => $viewer->person_id]);
    }
    $this->get($url)->assertOk();
    $this->getJson("/api/v1/media/{$media->id}/status")->assertOk();
    $event->update(['status' => 'cancelled', 'cancelled_at' => now()]);
    $this->get($url)->assertOk();
    auth()->forgetGuards();
    actingAsUser();
    $this->get($url)->assertStatus($visibility === 'church' ? 200 : 403);
    $this->getJson("/api/v1/media/{$media->id}/status")->assertStatus($visibility === 'church' ? 200 : 403);
    $event->update(['archived_at' => now()]);
    $this->get($url)->assertForbidden();
    auth()->forgetGuards();
    $this->actingAs($manager, 'web')->get($url)->assertOk();
})->with(['church', 'ministry', 'assigned']);
