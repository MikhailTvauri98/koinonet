<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\NotificationCategory;
use App\Modules\Notifications\NotificationPreferences;
use Dedoc\Scramble\Generator;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\Notification;

uses(RefreshDatabase::class);

it('treats a missing row as enabled', function () {
    $user = actingAsUser();

    expect(app(NotificationPreferences::class)->isEnabled($user, NotificationCategory::Announcements))->toBeTrue();
    $this->assertDatabaseCount('notification_settings', 0);
});

it('lists every category with its state', function () {
    $user = actingAsUser();
    NotificationSetting::query()->create(['user_id' => $user->id, 'category' => 'chat', 'enabled' => false]);

    $this->getJson('/api/v1/notification-settings')->assertOk()->assertExactJson(['data' => [
        ['category' => 'announcements', 'label' => 'Объявления', 'enabled' => true],
        ['category' => 'chat', 'label' => 'Чаты', 'enabled' => false],
        ['category' => 'assignments', 'label' => 'Назначения', 'enabled' => true],
        ['category' => 'reminders', 'label' => 'Напоминания', 'enabled' => true],
    ]]);
    $this->assertDatabaseCount('notification_settings', 1);
});

it('disables a category and leaves the others alone', function () {
    $user = actingAsUser();
    NotificationSetting::query()->create(['user_id' => $user->id, 'category' => 'chat', 'enabled' => false]);

    $this->putJson('/api/v1/notification-settings', ['settings' => ['reminders' => false]])
        ->assertOk()
        ->assertJsonFragment(['category' => 'reminders', 'label' => 'Напоминания', 'enabled' => false])
        ->assertJsonFragment(['category' => 'assignments', 'label' => 'Назначения', 'enabled' => true])
        ->assertJsonFragment(['category' => 'chat', 'label' => 'Чаты', 'enabled' => false]);

    expect(app(NotificationPreferences::class)->isEnabled($user, NotificationCategory::Reminders))->toBeFalse()
        ->and(app(NotificationPreferences::class)->isEnabled($user, NotificationCategory::Assignments))->toBeTrue();
    $this->assertDatabaseCount('notification_settings', 2);
});

it('re-enables a category without changing another account or category', function () {
    $user = actingAsUser();
    $other = User::factory()->create();
    foreach ([[$user, 'chat'], [$user, 'reminders'], [$other, 'chat']] as [$account, $category]) {
        NotificationSetting::query()->create(['user_id' => $account->id, 'category' => $category, 'enabled' => false]);
    }

    $this->putJson('/api/v1/notification-settings', ['settings' => ['chat' => true]])->assertOk();

    $preferences = app(NotificationPreferences::class);
    expect($preferences->isEnabled($user, NotificationCategory::Chat))->toBeTrue()
        ->and($preferences->isEnabled($user, NotificationCategory::Reminders))->toBeFalse()
        ->and($preferences->isEnabled($other, NotificationCategory::Chat))->toBeFalse();
    $this->assertDatabaseCount('notification_settings', 3);
});

it('rejects an unknown category without applying valid settings', function () {
    actingAsUser();

    $this->putJson('/api/v1/notification-settings', ['settings' => ['weather' => false, 'chat' => false]])
        ->assertUnprocessable()->assertJsonValidationErrors('settings.weather');
    $this->assertDatabaseCount('notification_settings', 0);
});

it('requires a session', function (string $method) {
    $this->{$method}('/api/v1/notification-settings', ['settings' => ['chat' => false]])->assertUnauthorized();
})->with(['getJson', 'putJson']);

it('does not expose another accounts preferences', function () {
    $other = User::factory()->create();
    NotificationSetting::query()->create(['user_id' => $other->id, 'category' => 'chat', 'enabled' => false]);
    actingAsUser();

    $this->getJson('/api/v1/notification-settings')->assertOk()
        ->assertJsonFragment(['category' => 'chat', 'label' => 'Чаты', 'enabled' => true]);
});

it('rejects malformed settings', function (array $payload, string $field) {
    actingAsUser();

    $this->putJson('/api/v1/notification-settings', $payload)
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    $this->assertDatabaseCount('notification_settings', 0);
})->with([
    'missing settings' => [[], 'settings'],
    'scalar settings' => [['settings' => false], 'settings'],
    'null state' => [['settings' => ['chat' => null]], 'settings.chat'],
    'non boolean state' => [['settings' => ['chat' => 'off']], 'settings.chat'],
    'numeric category' => [['settings' => [false]], 'settings.0'],
]);

it('can repeatedly update several category pairs', function () {
    $user = actingAsUser();

    foreach ([false, true, false] as $enabled) {
        $this->putJson('/api/v1/notification-settings', ['settings' => ['chat' => $enabled, 'reminders' => $enabled]])
            ->assertOk();
    }

    expect(app(NotificationPreferences::class)->all($user))->toBe([
        'announcements' => true, 'chat' => false, 'assignments' => true, 'reminders' => false,
    ]);
    $this->assertDatabaseCount('notification_settings', 2);
});

it('persists Laravel database notifications for a ULID account', function () {
    $user = actingAsUser();
    $user->notifyNow(new class extends Notification
    {
        public function via(object $notifiable): array
        {
            return ['database'];
        }

        public function toDatabase(object $notifiable): array
        {
            return ['title' => 'Назначение'];
        }
    });

    $notification = $user->notifications()->sole();
    expect($notification->notifiable_id)->toBe($user->id)
        ->and($notification->data)->toBe(['title' => 'Назначение'])
        ->and($notification->read_at)->toBeNull();
    $notification->markAsRead();
    expect($notification->fresh()->read_at)->not->toBeNull();
});

it('creates push subscriptions for an account with delivery defaults', function () {
    $user = User::factory()->create();
    $subscriptions = PushSubscription::factory()->count(2)->for($user)->create();

    expect($subscriptions[0]->id)->toHaveLength(26)
        ->and($subscriptions[0]->user_id)->toBe($user->id)
        ->and($subscriptions[0]->public_key)->not->toBeEmpty()
        ->and($subscriptions[0]->auth_token)->not->toBeEmpty()
        ->and($subscriptions[0]->content_encoding)->toBe('aes128gcm')
        ->and($subscriptions[0]->created_at)->not->toBeNull()
        ->and($subscriptions[0]->last_success_at)->toBeNull()
        ->and($subscriptions[0]->failures)->toBe(0)
        ->and($subscriptions[0]->endpoint)->not->toBe($subscriptions[1]->endpoint);
});

it('rejects duplicate push endpoints across accounts', function () {
    PushSubscription::factory()->create(['endpoint' => 'https://push.example.test/device']);

    expect(fn () => PushSubscription::factory()->create(['endpoint' => 'https://push.example.test/device']))
        ->toThrow(QueryException::class);
});

it('enforces the category catalog in storage', function () {
    $user = User::factory()->create();

    expect(fn () => NotificationSetting::query()->create([
        'user_id' => $user->id, 'category' => 'weather', 'enabled' => false,
    ]))->toThrow(QueryException::class);
});

it('allows only one setting per account and category', function () {
    $user = User::factory()->create();
    $values = ['user_id' => $user->id, 'category' => 'chat', 'enabled' => false];
    NotificationSetting::query()->create($values);

    expect(fn () => NotificationSetting::query()->create($values))->toThrow(QueryException::class);
});

it('documents boolean preference states', function () {
    $schema = app(Generator::class)();

    expect($schema['components']['schemas']['NotificationSettingResource']['properties']['enabled']['type'])
        ->toBe('boolean');
});

it('documents a partial object of known category settings', function () {
    $schema = app(Generator::class)();
    $settings = $schema['components']['schemas']['UpdateNotificationSettingsRequest']['properties']['settings'];

    expect($settings['type'])->toBe('object')
        ->and(array_keys($settings['properties']))->toBe(['announcements', 'chat', 'assignments', 'reminders'])
        ->and($settings['properties']['chat']['type'])->toBe('boolean')
        ->and($settings['required'] ?? [])->toBe([]);
});
