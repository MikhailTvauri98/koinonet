<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\Models\PushSubscription;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

function subscriptionPayload(string $endpoint = 'https://push.example/abc'): array
{
    return ['endpoint' => $endpoint, 'keys' => ['p256dh' => 'BPUBLIC', 'auth' => 'AUTH'], 'content_encoding' => 'aes128gcm'];
}

it('stores a subscription for the current account', function () {
    $user = actingAsUser();

    $this->postJson('/api/v1/push-subscriptions', subscriptionPayload(), ['User-Agent' => 'iPhone Safari'])
        ->assertCreated();

    $row = PushSubscription::query()->sole();
    expect($row->user_id)->toBe($user->id)
        ->and($row->public_key)->toBe('BPUBLIC')
        ->and($row->auth_token)->toBe('AUTH')
        ->and($row->user_agent)->toBe('iPhone Safari');
});

it('moves an endpoint to the account that re-subscribed with it', function () {
    $previous = User::factory()->create();
    PushSubscription::factory()->for($previous)->create(['endpoint' => 'https://push.example/abc']);
    $user = actingAsUser();

    $this->postJson('/api/v1/push-subscriptions', subscriptionPayload())->assertCreated();

    expect(PushSubscription::query()->count())->toBe(1)
        ->and(PushSubscription::query()->sole()->user_id)->toBe($user->id);
});

it('validates the subscription shape', function () {
    actingAsUser();

    $this->postJson('/api/v1/push-subscriptions', ['endpoint' => 'not-a-url'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['endpoint', 'keys.p256dh', 'keys.auth']);
});

it('deletes own subscription by endpoint', function () {
    $user = actingAsUser();
    PushSubscription::factory()->for($user)->create(['endpoint' => 'https://push.example/abc']);

    $this->deleteJson('/api/v1/push-subscriptions', ['endpoint' => 'https://push.example/abc'])->assertNoContent();

    expect(PushSubscription::query()->count())->toBe(0);
});

it('does not delete a subscription of another account', function () {
    PushSubscription::factory()->for(User::factory()->create())->create(['endpoint' => 'https://push.example/abc']);
    actingAsUser();

    $this->deleteJson('/api/v1/push-subscriptions', ['endpoint' => 'https://push.example/abc'])
        ->assertStatus(422)->assertJsonPath('code', 'push.subscription_not_found');

    expect(PushSubscription::query()->count())->toBe(1);
});

it('exposes the vapid public key in settings', function () {
    config(['webpush.vapid.public_key' => 'BPUBLICKEY']);
    actingAsUser();

    $this->getJson('/api/v1/settings')->assertOk()->assertJsonPath('data.vapid_public_key', 'BPUBLICKEY');
});

it('drops subscriptions when the account is disabled', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->create();
    $victim = User::factory()->for($person)->create();
    PushSubscription::factory()->for($victim)->count(2)->create();

    $this->postJson("/api/v1/people/{$person->id}/disable")->assertOk();

    expect(PushSubscription::query()->where('user_id', $victim->id)->count())->toBe(0);
});

it('drops subscriptions and settings when the person is erased', function () {
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $other = User::factory()->create();
    $entry = fn (User $account) => $account->notifications()->create([
        'id' => (string) Str::uuid(), 'type' => 'Sample', 'data' => [],
    ]);
    $entry($user);
    $retained = $entry($other);
    PushSubscription::factory()->for($user)->create();
    NotificationSetting::query()->create([
        'user_id' => $user->id, 'category' => 'chat', 'enabled' => false,
    ]);

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    expect(PushSubscription::query()->count())->toBe(0)
        ->and(NotificationSetting::query()->count())->toBe(0)
        ->and(DatabaseNotification::query()->pluck('id')->all())->toBe([$retained->id])
        ->and(User::query()->find($user->id))->toBeNull();
});

it('requires authentication for subscription changes', function () {
    $this->postJson('/api/v1/push-subscriptions', subscriptionPayload())->assertUnauthorized();
    $this->deleteJson('/api/v1/push-subscriptions', ['endpoint' => 'https://push.example/abc'])->assertUnauthorized();
});

it('defaults encoding and refreshes keys and delivery state on resubscribe', function () {
    $user = actingAsUser();
    $sub = PushSubscription::factory()->for($user)->create([
        'endpoint' => 'https://push.example/abc', 'failures' => 9, 'last_success_at' => now()->subDay(),
    ]);
    $payload = subscriptionPayload();
    unset($payload['content_encoding']);

    $this->postJson('/api/v1/push-subscriptions', $payload, ['User-Agent' => str_repeat('x', 300)])->assertCreated();

    expect($sub->fresh()->public_key)->toBe('BPUBLIC')->and($sub->fresh()->auth_token)->toBe('AUTH')
        ->and($sub->fresh()->content_encoding)->toBe('aes128gcm')->and($sub->fresh()->failures)->toBe(0)
        ->and($sub->fresh()->last_success_at)->toBeNull()->and(mb_strlen($sub->fresh()->user_agent))->toBe(255);
});

it('rejects invalid key sizes and encoding without storing a subscription', function (array $overrides, string $field) {
    actingAsUser();
    $this->postJson('/api/v1/push-subscriptions', array_replace_recursive(subscriptionPayload(), $overrides))
        ->assertUnprocessable()->assertJsonValidationErrors($field);
    expect(PushSubscription::query()->count())->toBe(0);
})->with([
    'public key size' => [['keys' => ['p256dh' => str_repeat('a', 256)]], 'keys.p256dh'],
    'auth size' => [['keys' => ['auth' => str_repeat('a', 256)]], 'keys.auth'],
    'unsupported encoding' => [['content_encoding' => 'bad'], 'content_encoding'],
]);

it('validates deletion and rejects missing endpoints with the domain code', function () {
    actingAsUser();
    $this->deleteJson('/api/v1/push-subscriptions', [])->assertUnprocessable()->assertJsonValidationErrors('endpoint');
    $this->deleteJson('/api/v1/push-subscriptions', ['endpoint' => 'https://push.example/missing'])
        ->assertUnprocessable()->assertJsonPath('code', 'push.subscription_not_found');
});

it('generates usable VAPID key pairs without writing configuration', function () {
    $previous = config('webpush.vapid');
    expect(Artisan::call('webpush:vapid'))->toBe(0);
    $output = Artisan::output();
    expect(preg_match('/VAPID_PUBLIC_KEY=([A-Za-z0-9_-]+)/', $output, $public))->toBe(1)
        ->and(preg_match('/VAPID_PRIVATE_KEY=([A-Za-z0-9_-]+)/', $output, $private))->toBe(1);
    $decode = fn (string $value) => base64_decode(strtr($value, '-_', '+/'), true);
    expect(strlen($decode($public[1])))->toBe(65)->and(strlen($decode($private[1])))->toBe(32);
    expect(config('webpush.vapid'))->toBe($previous);
});

it('documents subscription JSON bodies and public settings without secrets', function () {
    $schema = app(Generator::class)();
    $post = $schema['paths']['/push-subscriptions']['post'];
    $delete = $schema['paths']['/push-subscriptions']['delete'];
    expect($post['responses'])->toHaveKey('201')->and($delete['responses'])->toHaveKey('204')
        ->and($delete['parameters'] ?? [])->toBe([])
        ->and($delete['requestBody']['required'] ?? false)->toBeTrue();
    $body = $delete['requestBody']['content']['application/json']['schema'];
    if (isset($body['$ref'])) {
        $body = $schema['components']['schemas'][basename($body['$ref'])];
    }
    expect($body['required'])->toContain('endpoint')->and($body['properties'])->toHaveKey('endpoint');
    $settings = $schema['components']['schemas']['SettingsResource'];
    expect($settings['required'])->toContain('vapid_public_key')
        ->and($settings['properties'])->not->toHaveKey('vapid_private_key');
});
