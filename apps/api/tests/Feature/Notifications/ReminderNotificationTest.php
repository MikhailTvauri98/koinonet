<?php

declare(strict_types=1);

use App\Modules\Calendar\Events\EventReminderDue;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Calendar\ReminderKind;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Channels\WebPushChannel;
use App\Modules\Notifications\Listeners\NotifyAboutReminder;
use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\Notifications\EventReminderNotification;
use App\Modules\Settings\ChurchSettings;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;

uses(RefreshDatabase::class);

beforeEach(fn () => Notification::fake());

it('reminds distinct active assigned accounts with Russian church time and reminder routing', function (ReminderKind $kind, string $title) {
    app(ChurchSettings::class)->put(['church.timezone' => 'Europe/Moscow']);
    $event = Event::factory()->between(CarbonImmutable::parse('2026-11-08T07:00:00Z'), CarbonImmutable::parse('2026-11-08T09:00:00Z'))
        ->create(['title' => 'Служение', 'location' => 'Зал']);
    $user = User::factory()->create();
    foreach (range(1, 2) as $unused) {
        $slot = EventSlot::factory()->for($event)->create();
        EventAssignment::factory()->for($slot, 'slot')->for($user->person)->create();
    }
    $second = User::factory()->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create(), 'slot')->for($second->person)->create();
    EventAssignment::factory()->for(EventSlot::factory()->for($event)->create(), 'slot')->for(Person::factory()->create())->create();
    $stranger = User::factory()->create();

    app(NotifyAboutReminder::class)->handle(new EventReminderDue($event->id, $kind));

    Notification::assertSentTo([$user, $second], EventReminderNotification::class, function ($notification) use ($user, $event, $title) {
        expect($notification->toArray($user))->toBe([
            'category' => 'reminders', 'title' => $title, 'body' => 'Служение, 8 ноя, 10:00, Зал',
            'url' => "/events/{$event->id}", 'tag' => "event-{$event->id}-reminder",
        ]);

        return true;
    });
    Notification::assertNotSentTo($stranger, EventReminderNotification::class);
    Notification::assertCount(2);
})->with([[ReminderKind::H24, 'Напоминание: за сутки'], [ReminderKind::H2, 'Напоминание: за два часа']]);

it('rechecks current event and recipient state when the reminder listener runs', function (string $state) {
    $event = Event::factory()->create();
    $slot = EventSlot::factory()->for($event)->create();
    $user = User::factory()->create();
    $assignment = EventAssignment::factory()->for($slot, 'slot')->for($user->person)->create();
    match ($state) {
        'cancelled' => $event->update(['status' => 'cancelled']),
        'event archived' => $event->update(['archived_at' => now()]),
        'slot archived' => $slot->update(['archived_at' => now()]),
        'assignment archived' => $assignment->update(['archived_at' => now()]),
        'person archived' => $user->person->update(['archived_at' => now()]),
        'disabled' => $user->update(['disabled_at' => now()]),
        'missing' => $event->id = (string) str()->ulid(),
    };

    app(NotifyAboutReminder::class)->handle(new EventReminderDue($event->id, ReminderKind::H2));

    Notification::assertNothingSent();
})->with(['cancelled', 'event archived', 'slot archived', 'assignment archived', 'person archived', 'disabled', 'missing']);

it('keeps the center and broadcast when reminder pushes are disabled and omits an absent location', function () {
    $event = Event::factory()->create(['location' => null]);
    $user = User::factory()->create();
    PushSubscription::factory()->for($user)->create();
    NotificationSetting::query()->create(['user_id' => $user->id, 'category' => 'reminders', 'enabled' => false]);
    $notification = new EventReminderNotification($event, ReminderKind::H2);

    expect($notification->via($user))->toBe(['broadcast', 'database'])->and($notification->body())->not->toEndWith(', ');
    NotificationSetting::query()->where('user_id', $user->id)->update(['enabled' => true]);
    expect($notification->via($user))->toContain(WebPushChannel::class);
});
