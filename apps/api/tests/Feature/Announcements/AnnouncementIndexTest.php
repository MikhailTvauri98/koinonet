<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Settings\ChurchSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;

uses(RefreshDatabase::class);

afterEach(fn () => Carbon::setTestNow());

it('shows church announcements to any account', function () {
    actingAsUser();
    Announcement::factory()->count(2)->create();

    $this->getJson('/api/v1/announcements')->assertOk()->assertJsonCount(2, 'data');
});

it('puts pinned announcements first, then newest', function () {
    actingAsUser();
    $old = Announcement::factory()->create(['published_at' => now()->subDays(2)]);
    $new = Announcement::factory()->create(['published_at' => now()->subDay()]);
    $pinned = Announcement::factory()->pinned()->create(['published_at' => now()->subDays(5)]);

    $ids = collect($this->getJson('/api/v1/announcements')->json('data'))->pluck('id')->all();

    expect($ids)->toBe([$pinned->id, $new->id, $old->id]);
});

it('hides announcements past hide_after', function () {
    actingAsUser();
    Announcement::factory()->hiddenAfter(now()->subDay()->toDateString())->create();
    $visible = Announcement::factory()->hiddenAfter(now()->addDay()->toDateString())->create();

    $ids = collect($this->getJson('/api/v1/announcements')->json('data'))->pluck('id')->all();

    expect($ids)->toEqual([$visible->id]);
});

it('judges hide_after by the church calendar, not utc', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'Pacific/Auckland']);
    Carbon::setTestNow('2026-10-01 11:30:00'); // в Окленде уже 2 октября
    actingAsUser();
    Announcement::factory()->hiddenAfter('2026-10-01')->create();

    $this->getJson('/api/v1/announcements')->assertOk()->assertJsonCount(0, 'data');
});

it('hides archived announcements from the list', function () {
    actingAsUser();
    Announcement::factory()->archived()->create();

    $this->getJson('/api/v1/announcements')->assertOk()->assertJsonCount(0, 'data');
});

it('filters by scope and ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Молодёжное');
    actingAsUserWith([Permission::MinistriesViewAll]);
    Announcement::factory()->create();
    $mine = Announcement::factory()->ministry($ministry)->create();
    Announcement::factory()->ministry($other)->create();

    $ids = collect($this->getJson("/api/v1/announcements?scope=ministry&ministry={$ministry->id}")->json('data'))->pluck('id')->all();

    expect($ids)->toEqual([$mine->id]);
});

it('paginates', function () {
    actingAsUser();
    Announcement::factory()->count(25)->create();

    $this->getJson('/api/v1/announcements?per_page=10')
        ->assertOk()->assertJsonCount(10, 'data')->assertJsonPath('meta.total', 25);
});

it('preserves ministry scope and page size when following the next page link', function () {
    actingAsUserWith([Permission::MinistriesViewAll]);
    $ministry = ministryWithRoles();
    $older = Announcement::factory()->ministry($ministry)->create(['published_at' => now()->subDay()]);
    $newer = Announcement::factory()->ministry($ministry)->create();
    Announcement::factory()->count(3)->create();
    Announcement::factory()->ministry(ministryWithRoles('Другое'))->create();

    $first = $this->getJson("/api/v1/announcements?scope=ministry&ministry={$ministry->id}&per_page=1")
        ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $newer->id);

    $this->getJson($first->json('links.next'))->assertOk()
        ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $older->id)
        ->assertJsonPath('meta.total', 2)->assertJsonPath('meta.current_page', 2);
});

it('keeps hide_after inclusive through the end of the church day', function () {
    app(ChurchSettings::class)->put(['church.timezone' => 'America/Los_Angeles']);
    Carbon::setTestNow('2026-10-02 06:59:59');
    actingAsUser();
    $announcement = Announcement::factory()->hiddenAfter('2026-10-01')->create();

    $this->getJson('/api/v1/announcements')->assertJsonPath('data.0.id', $announcement->id);
    Carbon::setTestNow('2026-10-02 07:00:00');
    $this->getJson('/api/v1/announcements')->assertJsonCount(0, 'data');
});

it('never lists archived announcements even for managers or their author', function () {
    $author = actingAsUserWith([Permission::MinistriesManageAll]);
    Announcement::factory()->archived()->create(['author_user_id' => $author->id]);
    Announcement::factory()->ministry(ministryWithRoles())->archived()->create();

    $this->getJson('/api/v1/announcements')->assertOk()->assertJsonCount(0, 'data');
});

it('does not let a ministry filter expose an invisible announcement', function () {
    actingAsUser();
    $ministry = ministryWithRoles();
    Announcement::factory()->ministry($ministry)->create();

    $this->getJson("/api/v1/announcements?ministry={$ministry->id}")
        ->assertOk()->assertJsonCount(0, 'data');
});

it('validates pagination and filter input', function (array $query, string $field) {
    actingAsUser();

    $this->getJson('/api/v1/announcements?'.http_build_query($query))
        ->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    [['per_page' => 0], 'per_page'],
    [['per_page' => 101], 'per_page'],
    [['page' => 0], 'page'],
    [['scope' => 'invalid'], 'scope'],
    [['ministry' => 'invalid'], 'ministry'],
]);
