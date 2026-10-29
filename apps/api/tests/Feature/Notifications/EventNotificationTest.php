<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\Actions\CancelEvent;
use App\Modules\Calendar\Events\EventCreated;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Channels\WebPushChannel;
use App\Modules\Notifications\Listeners\NotifyAboutNewEvent;
use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\Notifications\EventAnnouncedNotification;
use App\Modules\Notifications\Notifications\EventCancelledNotification;
use App\Modules\Notifications\Notifications\EventChangedNotification;
use App\Modules\Notifications\Recipients;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\LazyCollection;

uses(RefreshDatabase::class);

beforeEach(fn () => Notification::fake());

it('notifies active assignees once about actual time and location changes', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    $user = User::factory()->create();
    foreach (range(1, 2) as $unused) {
        EventAssignment::factory()->for(EventSlot::factory()->for($event)->create(), 'slot')->for($user->person)->create();
    }
    $this->patchJson("/api/v1/events/{$event->id}", [
        'starts_at' => $event->starts_at->addHour()->toISOString(),
        'ends_at' => $event->ends_at->addHour()->toISOString(), 'location' => 'Зал 2',
    ])->assertOk();
    Notification::assertSentTo($user, EventChangedNotification::class, fn ($notification) => $notification->title() === 'Событие изменено'
        && substr_count($notification->body(), 'время') === 1
        && str_contains($notification->body(), 'место')
        && $notification->toArray($user)['category'] === 'assignments'
        && $notification->url() === "/events/{$event->id}" && $notification->tag() === "event-{$event->id}");
    Notification::assertCount(1);
});

it('keeps description only and equivalent time edits silent', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create(), 'slot')->for(User::factory()->create()->person)->create();
    $this->patchJson("/api/v1/events/{$event->id}", ['description' => 'Описание', 'starts_at' => $event->starts_at->toISOString()])->assertOk();
    Notification::assertNothingSent();
});

it('selects lazy distinct recipients from live assignments slots events and people', function () {
    $event = Event::factory()->create();
    $active = User::factory()->create();
    $disabled = User::factory()->create(['disabled_at' => now()]);
    $archivedPerson = User::factory()->create();
    $archivedPerson->person->update(['archived_at' => now()]);
    foreach ([$active, $active, $disabled, $archivedPerson] as $user) {
        EventAssignment::factory()->for(EventSlot::factory()->for($event)->create(), 'slot')->for($user->person)->create();
    }
    $historical = User::factory()->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create(), 'slot')->for($historical->person)->create(['archived_at' => now()]);
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create(['archived_at' => now()]), 'slot')->for($historical->person)->create();
    $recipients = app(Recipients::class)->assignedToEvent($event->id);
    expect($recipients)->toBeInstanceOf(LazyCollection::class)->and($recipients->pluck('id')->all())->toBe([$active->id]);

    app(CancelEvent::class)->handle($event, 'Ремонт зала', null);
    Notification::assertSentTo($active, EventCancelledNotification::class, fn ($notification) => str_contains($notification->body(), 'Ремонт зала') && $notification->title() === 'Событие отменено');
    Notification::assertCount(1);
    $event->update(['archived_at' => now()]);
    expect(app(Recipients::class)->assignedToEvent($event->id)->all())->toBe([])
        ->and(app(Recipients::class)->assignedToEvent((string) str()->ulid())->all())->toBe([]);
});

it('announces a church event only when requested and visible to the recipient', function () {
    $manager = actingAsUserWith([Permission::CalendarChurchManage]);
    $other = User::factory()->create();
    $body = ['owner_type' => 'church', 'title' => 'Крещение', 'starts_at' => '2026-11-08T07:00:00Z', 'ends_at' => '2026-11-08T09:00:00Z', 'visibility' => 'church'];
    $this->postJson('/api/v1/events', $body)->assertCreated();
    Notification::assertNothingSent();
    $this->postJson('/api/v1/events', [...$body, 'notify' => 'all'])->assertCreated();
    Notification::assertSentTo([$manager, $other], EventAnnouncedNotification::class);
    Notification::assertCount(2);
    Notification::fake();
    $this->postJson('/api/v1/events', [...$body, 'visibility' => 'assigned', 'notify' => 'all'])->assertCreated();
    Notification::assertSentTo($manager, EventAnnouncedNotification::class);
    Notification::assertNotSentTo($other, EventAnnouncedNotification::class);
    Notification::assertCount(1);
});

it('intersects ministry announcement recipients with event visibility', function (string $visibility) {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesManageAll]);
    $member = User::factory()->create();
    memberOf($ministry, $member->person);
    $stranger = User::factory()->create();
    $this->postJson('/api/v1/events', [
        'owner_type' => 'ministry', 'ministry_id' => $ministry->id, 'title' => 'Репетиция',
        'starts_at' => '2026-11-07T15:00:00Z', 'ends_at' => '2026-11-07T17:00:00Z',
        'visibility' => $visibility, 'notify' => 'ministry',
    ])->assertCreated();
    if ($visibility === 'ministry') {
        Notification::assertSentTo($member, EventAnnouncedNotification::class);
        Notification::assertCount(1);
    } else {
        Notification::assertNothingSent();
    }
    Notification::assertNotSentTo($stranger, EventAnnouncedNotification::class);
})->with(['ministry', 'assigned']);

it('skips missing and archived events at announcement delivery time', function (bool $archived) {
    User::factory()->create();
    $event = Event::factory()->create(['archived_at' => $archived ? now() : null]);
    app(NotifyAboutNewEvent::class)->handle(new EventCreated($archived ? $event->id : (string) str()->ulid(), 'all'));
    Notification::assertNothingSent();
})->with([false, true]);

it('retains database and broadcast when assignment push preference is disabled', function () {
    $user = User::factory()->create();
    PushSubscription::factory()->for($user)->create();
    $notification = new EventAnnouncedNotification(Event::factory()->create());
    expect($notification->via($user))->toBe(['broadcast', 'database', WebPushChannel::class]);
    NotificationSetting::query()->create(['user_id' => $user->id, 'category' => 'assignments', 'enabled' => false]);
    expect($notification->via($user))->toBe(['broadcast', 'database']);
});
