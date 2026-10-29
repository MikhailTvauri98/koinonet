<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    config([
        'broadcasting.default' => 'reverb',
        'broadcasting.connections.reverb.key' => 'test-key',
        'broadcasting.connections.reverb.secret' => 'test-secret',
        'broadcasting.connections.reverb.app_id' => 'test-app',
    ]);
    // The application booted with the log driver. Register the real callbacks
    // on the Reverb driver selected for this test as well.
    require base_path('routes/channels.php');
});

it('requires a session to authorize a channel', function () {
    $this->postJson('/broadcasting/auth', [
        'channel_name' => 'private-user.01J000000000000000000000AA',
        'socket_id' => '1234.5678',
    ])->assertUnauthorized();
});

it('returns JSON to a guest without an Accept header', function () {
    $this->post('/broadcasting/auth', [
        'channel_name' => 'private-user.01J000000000000000000000AA',
        'socket_id' => '1234.5678',
    ])->assertUnauthorized()->assertExactJson(['message' => 'Требуется вход.']);
});

it('authorizes an account for its own user channel', function () {
    $user = actingAsUser();
    $channel = "private-user.{$user->id}";

    $this->postJson('/broadcasting/auth', [
        'channel_name' => $channel,
        'socket_id' => '1234.5678',
    ])->assertOk()->assertExactJson([
        'auth' => 'test-key:'.hash_hmac('sha256', '1234.5678:'.$channel, 'test-secret'),
    ]);
});

it('refuses the user channel of another account', function () {
    actingAsUser();
    $other = User::factory()->create();

    $this->postJson('/broadcasting/auth', [
        'channel_name' => "private-user.{$other->id}",
        'socket_id' => '1234.5678',
    ])->assertForbidden();
});

it('refuses a disabled account even on its own channel', function () {
    $user = actingAsUser(attributes: ['disabled_at' => now()]);

    $this->postJson('/broadcasting/auth', [
        'channel_name' => "private-user.{$user->id}",
        'socket_id' => '1234.5678',
    ])->assertForbidden();
});

it('authorizes using the cookie session established at login', function () {
    $user = User::factory()->create(['email' => 'realtime@example.com', 'password' => bcrypt('secret123')]);
    $this->withHeader('Origin', 'http://localhost');
    keepSessionCookie();
    $this->postJson('/api/v1/auth/login', ['login' => $user->email, 'password' => 'secret123'])->assertOk();
    keepSessionCookie();
    app('auth')->forgetGuards();

    $this->postJson('/broadcasting/auth', [
        'channel_name' => "private-user.{$user->id}",
        'socket_id' => '1234.5678',
    ])->assertOk()->assertJsonStructure(['auth']);
});

it('refuses channels that are not registered', function () {
    actingAsUser();

    $this->postJson('/broadcasting/auth', [
        'channel_name' => 'private-chat.01J000000000000000000000AA',
        'socket_id' => '1234.5678',
    ])->assertForbidden();
});
