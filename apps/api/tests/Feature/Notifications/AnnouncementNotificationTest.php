<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Announcements\Events\AnnouncementPublished;
use App\Modules\Announcements\Models\Announcement;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Listeners\NotifyAboutAnnouncement;
use App\Modules\Notifications\Notifications\AnnouncementPublishedNotification;
use App\Modules\Notifications\Recipients;
use Illuminate\Events\CallQueuedListener;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\ChannelManager;
use Illuminate\Notifications\SendQueuedNotifications;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\LazyCollection;

uses(RefreshDatabase::class);

beforeEach(fn () => Notification::fake());

it('notifies every active account about a church announcement', function () {
    $publisher = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $others = User::factory()->count(3)->create();

    $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Собрание', 'body' => 'В **10:00**'])->assertCreated();

    Notification::assertSentTo($others, AnnouncementPublishedNotification::class);
    Notification::assertSentTo($publisher, AnnouncementPublishedNotification::class);
    Notification::assertCount(4);
});

it('notifies only active ministry members using account identities', function () {
    $ministry = ministryWithRoles();
    $publisher = actingAsUserWith([Permission::MinistriesManageAll]);
    $member = User::factory()->create();
    $membership = memberOf($ministry, $member->person);
    $stranger = User::factory()->create();
    memberOf(ministryWithRoles('Другое'), $stranger->person);
    $disabled = User::factory()->create(['disabled_at' => now()]);
    memberOf($ministry, $disabled->person);
    $archived = User::factory()->create();
    memberOf($ministry, $archived->person);
    $archived->person->update(['archived_at' => now()]);
    memberOf($ministry, Person::factory()->create());

    $this->postJson('/api/v1/announcements', [
        'scope' => 'ministry', 'ministry_id' => $ministry->id, 'title' => 'Репетиция', 'body' => 'В субботу',
    ])->assertCreated();

    expect($membership->id)->not->toBe($member->id);
    Notification::assertSentTo($member, AnnouncementPublishedNotification::class);
    Notification::assertNotSentTo([$publisher, $stranger, $disabled, $archived], AnnouncementPublishedNotification::class);
    Notification::assertCount(1);
});

it('excludes disabled accounts archived people and people without accounts', function () {
    $publisher = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $active = User::factory()->create();
    $disabled = User::factory()->create(['disabled_at' => now()]);
    $archived = User::factory()->for(Person::factory()->create(['archived_at' => now()]))->create();
    Person::factory()->create();

    $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Т', 'body' => 'Б'])->assertCreated();

    Notification::assertSentTo([$publisher, $active], AnnouncementPublishedNotification::class);
    Notification::assertNotSentTo([$disabled, $archived], AnnouncementPublishedNotification::class);
    Notification::assertCount(2);
});

it('sends nothing when notify_on_publish is off', function () {
    actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    User::factory()->create();

    $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Т', 'body' => 'Б', 'notify_on_publish' => false])->assertCreated();

    Notification::assertNothingSent();
});

it('does not notify again on edit pin or archive', function () {
    $publisher = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $recipient = User::factory()->create();
    $id = $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Т', 'body' => 'Б'])->assertCreated()->json('data.id');

    $this->patchJson("/api/v1/announcements/{$id}", ['title' => 'Т2'])->assertOk();
    $this->postJson("/api/v1/announcements/{$id}/pin")->assertOk();
    $this->postJson("/api/v1/announcements/{$id}/archive")->assertOk();

    Notification::assertSentToTimes($publisher, AnnouncementPublishedNotification::class, 1);
    Notification::assertSentToTimes($recipient, AnnouncementPublishedNotification::class, 1);
    Notification::assertCount(2);
});

it('carries the category tag url title and a plain text Markdown body', function () {
    $user = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $id = $this->postJson('/api/v1/announcements', [
        'scope' => 'church', 'title' => 'Собрание',
        'body' => "# Важно\n\nВ **10:00** [зал](https://example.com/a(b))\n\n- *Приходите* & ждите",
    ])->assertCreated()->json('data.id');

    Notification::assertSentTo($user, AnnouncementPublishedNotification::class, function (AnnouncementPublishedNotification $notification) use ($user, $id) {
        return $notification->toArray($user) === [
            'category' => 'announcements', 'title' => 'Собрание', 'body' => 'Важно В 10:00 зал Приходите & ждите',
            'url' => "/announcements/{$id}", 'tag' => "announcement-{$id}",
        ];
    });
});

it('still sends to active recipients when the author was erased before the queue ran', function () {
    $recipient = User::factory()->create();
    $announcement = Announcement::factory()->create(['author_user_id' => null]);

    app(NotifyAboutAnnouncement::class)->handle(new AnnouncementPublished($announcement->id));

    Notification::assertSentTo($recipient, AnnouncementPublishedNotification::class);
    Notification::assertCount(1);
});

it('ignores missing archived and opted out announcements at delivery time', function (string $state) {
    User::factory()->create();
    $announcement = Announcement::factory()->make(['author_user_id' => null]);
    if ($state !== 'missing') {
        $announcement->fill($state === 'archived' ? ['archived_at' => now()] : ['notify_on_publish' => false])->save();
    }

    app(NotifyAboutAnnouncement::class)->handle(new AnnouncementPublished($announcement->id ?? (string) str()->ulid()));

    Notification::assertNothingSent();
})->with(['missing', 'archived', 'opted out']);

it('exposes lazy active recipient collections', function () {
    $user = User::factory()->create();
    $ministry = ministryWithRoles();
    memberOf($ministry, $user->person);
    $recipients = app(Recipients::class);

    expect($recipients->allActive())->toBeInstanceOf(LazyCollection::class)
        ->and($recipients->allActive()->pluck('id')->all())->toBe([$user->id])
        ->and($recipients->ministryMembers($ministry->id))->toBeInstanceOf(LazyCollection::class)
        ->and($recipients->ministryMembers($ministry->id)->pluck('id')->all())->toBe([$user->id]);
});

it('queues delivery outside the publication request and reaches more than one recipient chunk', function () {
    Notification::swap(new ChannelManager(app()));
    Queue::fake();
    $publisher = actingAsUserWith([Permission::AnnouncementsChurchPublish]);
    $others = User::factory()->count(300)->create();

    $id = $this->postJson('/api/v1/announcements', ['scope' => 'church', 'title' => 'Т', 'body' => 'Б'])->assertCreated()->json('data.id');

    Queue::assertPushed(CallQueuedListener::class, fn ($job) => $job->class === NotifyAboutAnnouncement::class);
    Queue::assertPushed(CallQueuedListener::class, 1);
    Queue::assertNotPushed(SendQueuedNotifications::class);
    expect($publisher->notifications()->count())->toBe(0);

    app(NotifyAboutAnnouncement::class)->handle(new AnnouncementPublished($id));

    Queue::assertPushed(SendQueuedNotifications::class, 602);
    $ids = Queue::pushed(SendQueuedNotifications::class)->flatMap(fn ($job) => $job->notifiables->pluck('id'))->unique()->sort()->values()->all();
    expect($ids)->toBe($others->push($publisher)->pluck('id')->sort()->values()->all());
});
