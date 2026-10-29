<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionCache;
use App\Modules\Announcements\Events\AnnouncementPublished;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

function churchAnnouncement(array $over = []): array
{
    return ['scope' => 'church', 'title' => 'Собрание', 'body' => 'В воскресенье', ...$over];
}

it('denies publishing a church announcement without announcements.church.publish', function () {
    actingAsUserWith([Permission::PeopleView]);

    $this->postJson('/api/v1/announcements', churchAnnouncement())->assertForbidden();
});

it('publishes a church announcement', function () {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);

    $this->postJson('/api/v1/announcements', churchAnnouncement())
        ->assertCreated()
        ->assertJsonPath('data.scope', 'church')
        ->assertJsonPath('data.pinned', false)
        ->assertJsonPath('data.notify_on_publish', true)
        ->assertJsonPath('data.author.id', $user->id);

    expect(Announcement::query()->sole()->published_at)->not->toBeNull();
});

it('denies publishing a ministry announcement without announcements.publish in it', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person);

    $this->postJson('/api/v1/announcements', churchAnnouncement(['scope' => 'ministry', 'ministry_id' => $ministry->id]))
        ->assertForbidden();
});

it('publishes a ministry announcement with announcements.publish in that ministry', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    $leader = $ministry->roles()->where('name', 'Лидер')->sole();
    memberOf($ministry, $user->person, [$leader->id]);

    $this->postJson('/api/v1/announcements', churchAnnouncement(['scope' => 'ministry', 'ministry_id' => $ministry->id]))
        ->assertCreated()
        ->assertJsonPath('data.ministry.id', $ministry->id);
});

it('does not let a ministry publisher post a church announcement', function () {
    $ministry = ministryWithRoles();
    $user = actingAsUser();
    memberOf($ministry, $user->person, [$ministry->roles()->where('name', 'Лидер')->sole()->id]);

    $this->postJson('/api/v1/announcements', churchAnnouncement())->assertForbidden();
});

it('requires a ministry for the ministry scope', function () {
    actingAsUserWith([Permission::MinistriesManageAll]);

    $this->postJson('/api/v1/announcements', churchAnnouncement(['scope' => 'ministry']))
        ->assertStatus(422)->assertJsonValidationErrors('ministry_id');
});

it('cleans the body on save', function (string $body, string $expected) {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);

    $this->postJson('/api/v1/announcements', churchAnnouncement(['body' => $body]))
        ->assertCreated()
        ->assertJsonPath('data.body', $expected);
    expect(Announcement::query()->sole()->body)->toBe($expected);
})->with([
    ['Привет <img src=x onerror=alert(1)> [x](javascript:1)', 'Привет  [x]()'],
    ['[outer [bad](javascript:alert(1))](https://example.com)', '[outer [bad]()](https://example.com)'],
    ['![outer [bad](javascript:alert(1))](https://example.com/image.png)', 'outer [bad]()'],
]);

it('cleans nested Markdown before persisting edits', function (string $body, string $expected) {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $announcement = Announcement::factory()->create(['body' => 'До правки']);
    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['body' => $body])
        ->assertOk()->assertJsonPath('data.body', $expected);
    expect($announcement->fresh()->body)->toBe($expected);
})->with([
    ['[outer [bad](javascript:alert(1))](https://example.com)', '[outer [bad]()](https://example.com)'],
    ['![outer [bad](javascript:alert(1))](https://example.com/image.png)', 'outer [bad]()'],
]);

it('stores pinned and hide_after', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);

    $this->postJson('/api/v1/announcements', churchAnnouncement(['pinned' => true, 'hide_after' => '2026-12-31']))
        ->assertCreated()
        ->assertJsonPath('data.pinned', true)
        ->assertJsonPath('data.hide_after', '2026-12-31');
});

it('lets the author edit their own announcement even without the permission any more', function () {
    $person = Person::factory()->create();
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish], $person);
    $announcement = Announcement::factory()->create(['author_user_id' => $user->id]);
    $person->globalRoles()->detach();
    app(PermissionCache::class)->bump($user->id);

    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['title' => 'Новое название'])
        ->assertOk()->assertJsonPath('data.title', 'Новое название');
});

it('lets a publisher edit someone elses announcement in scope', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $announcement = Announcement::factory()->create();

    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['body' => 'Изменено'])->assertOk();
});

it('denies editing to a plain reader', function () {
    actingAsUser();
    $announcement = Announcement::factory()->create();

    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['body' => 'Изменено'])->assertForbidden();
});

it('refuses to edit an archived announcement', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $announcement = Announcement::factory()->archived()->create();

    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['body' => 'Изменено'])
        ->assertStatus(422)->assertJsonPath('code', 'announcement.archived');
});

it('publishes the domain event once and not on edit', function () {
    Event::fake([AnnouncementPublished::class]);
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);

    $id = $this->postJson('/api/v1/announcements', churchAnnouncement())->json('data.id');
    $this->patchJson("/api/v1/announcements/{$id}", ['title' => 'Другое']);

    Event::assertDispatchedTimes(AnnouncementPublished::class, 1);
});

it('preserves history and removes the erased account from authors and views', function () {
    $user = actingAsUser();
    $other = User::factory()->create();
    $announcement = Announcement::factory()->create(['author_user_id' => $user->id]);
    $otherAnnouncement = Announcement::factory()->create(['author_user_id' => $other->id]);
    DB::table('announcement_views')->insert([
        ['announcement_id' => $announcement->id, 'user_id' => $user->id, 'viewed_at' => now()],
        ['announcement_id' => $announcement->id, 'user_id' => $other->id, 'viewed_at' => now()],
    ]);

    $this->artisan('people:erase', ['id' => $user->person_id, '--force' => true])->assertSuccessful();

    expect($announcement->fresh()->author_user_id)->toBeNull()
        ->and($announcement->fresh()->body)->toBe($announcement->body)
        ->and($announcement->views()->pluck('user_id')->all())->toBe([$other->id])
        ->and($otherAnnouncement->fresh()->author_user_id)->toBe($other->id);
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['title' => 'История'])
        ->assertOk()->assertJsonPath('data.author', null);
});

it('only grants the ministry publishing right in its own ministry', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Другое служение');
    $user = actingAsUser();
    $role = Role::factory()->ministry($ministry->id)
        ->withPermissions([Permission::AnnouncementsPublish])->create();
    memberOf($ministry, $user->person, [$role->id]);
    $announcement = Announcement::factory()->ministry($other)->create();

    $this->postJson('/api/v1/announcements', churchAnnouncement(['scope' => 'ministry', 'ministry_id' => $other->id]))->assertForbidden();
    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['title' => 'Нет'])->assertForbidden();
});

it('rejects invalid publish fields', function (array $attributes, string $field) {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $this->postJson('/api/v1/announcements', churchAnnouncement($attributes))
        ->assertUnprocessable()->assertJsonValidationErrors($field);
})->with([
    [['scope' => 'other'], 'scope'],
    [['ministry_id' => '01JQZ0000000000000000000ZZ'], 'ministry_id'],
    [['title' => str_repeat('x', 201)], 'title'],
    [['body' => str_repeat('x', 20001)], 'body'],
    [['hide_after' => 'tomorrow'], 'hide_after'],
    [['pinned' => 'yes'], 'pinned'],
    [['notify_on_publish' => 'yes'], 'notify_on_publish'],
]);

it('updates editable fields without moving scope or authorship', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $announcement = Announcement::factory()->pinned()->hiddenAfter('2026-12-31')->create();
    $this->patchJson("/api/v1/announcements/{$announcement->id}", [
        'body' => '<b>Текст</b> [x](javascript:alert(1))',
        'pinned' => false, 'hide_after' => null, 'notify_on_publish' => false,
    ])->assertOk()->assertJsonPath('data.body', 'Текст [x]()')->assertJsonPath('data.pinned', false)
        ->assertJsonPath('data.hide_after', null)->assertJsonPath('data.notify_on_publish', false)
        ->assertJsonPath('data.attachments', [])->assertJsonPath('data.views_count', 0);
    $this->patchJson("/api/v1/announcements/{$announcement->id}", ['scope' => 'ministry'])
        ->assertUnprocessable()->assertJsonValidationErrors('scope');
    expect($announcement->fresh()->author_user_id)->toBe($announcement->author_user_id)
        ->and($announcement->fresh()->published_at->equalTo($announcement->published_at))->toBeTrue();
});

it('documents publication fields and immutable scope accurately', function () {
    $schema = app(Generator::class)();
    expect($schema['paths']['/announcements']['post']['responses'])->toHaveKey('201')
        ->and($schema['paths']['/announcements/{announcement}']['patch']['responses'])->toHaveKey('200');
    $resource = $schema['components']['schemas']['AnnouncementResource']['properties'];
    expect($resource['scope'])->toBe(['$ref' => '#/components/schemas/AnnouncementScope'])
        ->and($resource['published_at']['type'])->toBe('string')
        ->and($resource['published_at']['format'])->toBe('date-time')
        ->and($resource['hide_after']['format'])->toBe('date')
        ->and($resource['author']['type'])->toContain('null')
        ->and($resource['attachments']['items'])->toBe(['$ref' => '#/components/schemas/MediaResource']);
    $update = $schema['components']['schemas']['UpdateAnnouncementRequest'];
    expect($update['properties']['scope'])->toBeFalse()
        ->and($update['properties']['ministry_id'])->toBeFalse();
    $store = $schema['components']['schemas']['StoreAnnouncementRequest'];
    expect($store['oneOf'][1]['required'])->toContain('ministry_id');
});
