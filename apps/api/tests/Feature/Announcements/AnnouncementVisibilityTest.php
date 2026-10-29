<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Announcements\Events\AnnouncementPublished;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Announcements\Models\AnnouncementView;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

afterEach(fn () => Carbon::setTestNow());

it('hides a ministry announcement from a non-member', function () {
    $ministry = ministryWithRoles();
    actingAsUser();
    $announcement = Announcement::factory()->ministry($ministry)->create();

    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertForbidden();

    expect(collect($this->getJson('/api/v1/announcements')->json('data'))->pluck('id'))->not->toContain($announcement->id);
});

it('shows a ministry announcement to a member', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);
    $announcement = Announcement::factory()->ministry($ministry)->create();

    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk();
});

it('shows a ministry announcement to ministries.view_all', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesViewAll]);
    $announcement = Announcement::factory()->ministry($ministry)->create();

    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk();
});

it('opens an announcement hidden by date through a direct link', function () {
    actingAsUser();
    $announcement = Announcement::factory()->hiddenAfter('2020-01-01')->create();

    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk();
});

it('returns 404 for an archived announcement to a plain reader and opens it to a publisher', function () {
    $announcement = Announcement::factory()->archived()->create();

    actingAsUser();
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertNotFound();

    app('auth')->forgetGuards();
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk()->assertJsonPath('data.archived', true);
});

it('records a view once per account', function () {
    $user = actingAsUser();
    $announcement = Announcement::factory()->create();

    $this->getJson("/api/v1/announcements/{$announcement->id}");
    $this->getJson("/api/v1/announcements/{$announcement->id}");

    expect(AnnouncementView::query()->where('user_id', $user->id)->count())->toBe(1);
});

it('shows views_count to a publisher and hides it from a reader', function () {
    $announcement = Announcement::factory()->create();
    actingAsUser();
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertJsonMissingPath('data.views_count');

    app('auth')->forgetGuards();
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertJsonPath('data.views_count', 2);
});

it('pins and unpins with the publish permission only', function () {
    $announcement = Announcement::factory()->create();

    actingAsUser();
    $this->postJson("/api/v1/announcements/{$announcement->id}/pin")->assertForbidden();

    app('auth')->forgetGuards();
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $this->postJson("/api/v1/announcements/{$announcement->id}/pin")->assertOk()->assertJsonPath('data.pinned', true);
    $this->postJson("/api/v1/announcements/{$announcement->id}/unpin")->assertOk()->assertJsonPath('data.pinned', false);
});

it('archives and writes to the journal', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $announcement = Announcement::factory()->create();

    $this->postJson("/api/v1/announcements/{$announcement->id}/archive")->assertOk()->assertJsonPath('data.archived', true);

    expect(AuditEntry::query()->where('action', 'announcement.archived')->exists())->toBeTrue();
});

it('keeps ministry author visibility after membership ends and allows management', function () {
    $author = actingAsUser();
    $announcement = Announcement::factory()->ministry(ministryWithRoles())
        ->create(['author_user_id' => $author->id]);

    $this->getJson('/api/v1/announcements')->assertJsonPath('data.0.id', $announcement->id)
        ->assertJsonPath('data.0.views_count', 0);
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk()
        ->assertJsonPath('data.views_count', 1);
    $this->postJson("/api/v1/announcements/{$announcement->id}/pin")->assertOk();
    $this->postJson("/api/v1/announcements/{$announcement->id}/unpin")->assertOk();
    $this->postJson("/api/v1/announcements/{$announcement->id}/archive")->assertOk();
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk();
});

it('gives all ministry managers the same list and direct visibility without membership', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);
    $announcement = Announcement::factory()->ministry(ministryWithRoles())->create();

    $this->getJson('/api/v1/announcements')->assertJsonPath('data.0.id', $announcement->id)
        ->assertJsonPath('data.0.views_count', 0);
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk()
        ->assertJsonPath('data.views_count', 1);
    $this->postJson("/api/v1/announcements/{$announcement->id}/archive")->assertOk();
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk();
});

it('limits ministry publication management to that ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Другое');
    $publisher = actingAsUser();
    $role = Role::factory()->ministry($ministry->id)
        ->withPermissions([Permission::AnnouncementsPublish])->create();
    memberOf($ministry, $publisher->person, [$role->id]);
    $mine = Announcement::factory()->ministry($ministry)->create();
    $hidden = Announcement::factory()->ministry($other)->create();

    $this->getJson('/api/v1/announcements')->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.id', $mine->id)->assertJsonPath('data.0.views_count', 0);
    $this->getJson("/api/v1/announcements/{$mine->id}")->assertOk()->assertJsonPath('data.views_count', 1);
    foreach (['pin', 'unpin', 'archive'] as $action) {
        $this->postJson("/api/v1/announcements/{$hidden->id}/{$action}")->assertForbidden();
    }
    $this->getJson("/api/v1/announcements/{$hidden->id}")->assertForbidden();
    $this->postJson("/api/v1/announcements/{$mine->id}/pin")->assertOk();
    $this->postJson("/api/v1/announcements/{$mine->id}/unpin")->assertOk();
    $this->postJson("/api/v1/announcements/{$mine->id}/archive")->assertOk();
    $this->getJson("/api/v1/announcements/{$mine->id}")->assertOk();
});

it('does not give a ministry reader counts or mutation rights', function (bool $viewAll) {
    $ministry = ministryWithRoles();
    $viewer = $viewAll ? actingAsUserWith([Permission::MinistriesViewAll]) : actingAsUser();
    if (! $viewAll) {
        memberOf($ministry, $viewer->person);
    }
    $announcement = Announcement::factory()->ministry($ministry)->create();

    $this->getJson('/api/v1/announcements')->assertJsonMissingPath('data.0.views_count');
    $this->getJson("/api/v1/announcements/{$announcement->id}")
        ->assertOk()->assertJsonMissingPath('data.views_count');
    foreach (['pin', 'unpin', 'archive'] as $action) {
        $this->postJson("/api/v1/announcements/{$announcement->id}/{$action}")->assertForbidden();
    }
    $announcement->update(['archived_at' => now()]);
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertNotFound();
})->with([true, false]);

it('does not record forbidden or archived invisible reads', function () {
    actingAsUser();
    $active = Announcement::factory()->ministry(ministryWithRoles())->create();
    $archived = Announcement::factory()->ministry(ministryWithRoles('Другое'))->archived()->create();

    $this->getJson("/api/v1/announcements/{$active->id}")->assertForbidden();
    $this->getJson("/api/v1/announcements/{$archived->id}")->assertNotFound();
    expect(AnnouncementView::query()->count())->toBe(0);
});

it('preserves the first viewed_at timestamp for repeated reads', function () {
    actingAsUser();
    $announcement = Announcement::factory()->create();
    Carbon::setTestNow('2026-10-29 10:00:00');
    $first = '2026-10-29T10:00:00.000000Z';
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk();
    $this->travel(1)->hour();
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertOk();

    expect(AnnouncementView::query()->sole()->viewed_at->toISOString())->toBe($first);
});

it('makes pin unpin and archive repeatable without duplicate audit or publication events', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $announcement = Announcement::factory()->create();
    Event::fake([AnnouncementPublished::class]);
    $baseline = AuditEntry::query()->count();

    $this->postJson("/api/v1/announcements/{$announcement->id}/pin")->assertOk();
    $pinnedAt = $announcement->fresh()->pinned_at->toISOString();
    $this->travel(1)->hour();
    $this->postJson("/api/v1/announcements/{$announcement->id}/pin")->assertOk();
    expect($announcement->fresh()->pinned_at->toISOString())->toBe($pinnedAt);
    $this->postJson("/api/v1/announcements/{$announcement->id}/unpin")->assertOk();
    $this->postJson("/api/v1/announcements/{$announcement->id}/unpin")->assertOk();
    expect(AuditEntry::query()->count())->toBe($baseline);
    $this->postJson("/api/v1/announcements/{$announcement->id}/archive")->assertOk();
    $archivedAt = $announcement->fresh()->archived_at->toISOString();
    $this->travel(1)->hour();
    $this->postJson("/api/v1/announcements/{$announcement->id}/archive")->assertOk();
    expect($announcement->fresh()->archived_at->toISOString())->toBe($archivedAt);
    $entry = AuditEntry::query()->where('action', 'announcement.archived')->sole();
    expect($entry->actor_user_id)->toBe(auth()->id())->and($entry->subject_id)->toBe($announcement->id)
        ->and(AuditEntry::query()->count())->toBe($baseline + 1);
    Event::assertNotDispatched(AnnouncementPublished::class);
    foreach (['pin', 'unpin'] as $action) {
        $this->postJson("/api/v1/announcements/{$announcement->id}/{$action}")
            ->assertUnprocessable()->assertJsonPath('code', 'announcement.archived');
    }
});

it('requires authentication for every new endpoint', function () {
    $announcement = Announcement::factory()->create();
    $this->getJson('/api/v1/announcements')->assertUnauthorized();
    $this->getJson("/api/v1/announcements/{$announcement->id}")->assertUnauthorized();
    foreach (['pin', 'unpin', 'archive'] as $action) {
        $this->postJson("/api/v1/announcements/{$announcement->id}/{$action}")->assertUnauthorized();
    }
});
