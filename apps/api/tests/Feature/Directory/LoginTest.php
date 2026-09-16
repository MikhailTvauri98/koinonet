<?php

declare(strict_types=1);

use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->withHeader('Origin', 'http://localhost');
});

it('logs in by phone', function () {
    $person = Person::factory()->create(['first_name' => 'Иван']);
    User::factory()->for($person)->create([
        'phone' => '+79123456789',
        'email' => null,
        'password' => bcrypt('secret123'),
    ]);

    $this->postJson('/api/v1/auth/login', [
        'login' => '8 912 345 67 89',
        'password' => 'secret123',
    ])
        ->assertOk()
        ->assertJsonPath('person.first_name', 'Иван');

    $this->assertAuthenticated();
});

it('logs in by email case-insensitively', function () {
    User::factory()->create([
        'email' => 'ivan@example.com',
        'password' => bcrypt('secret123'),
    ]);

    $this->postJson('/api/v1/auth/login', [
        'login' => 'IVAN@example.com',
        'password' => 'secret123',
    ])->assertOk();
});

it('rejects a wrong password without revealing which field is wrong', function () {
    User::factory()->create([
        'email' => 'ivan@example.com',
        'password' => bcrypt('secret123'),
    ]);

    $this->postJson('/api/v1/auth/login', [
        'login' => 'ivan@example.com',
        'password' => 'nope',
    ])
        ->assertStatus(422)
        ->assertJsonValidationErrors('login');

    $this->assertGuest();
});

it('refuses a disabled account', function () {
    User::factory()->create([
        'email' => 'ivan@example.com',
        'password' => bcrypt('secret123'),
        'disabled_at' => now(),
    ]);

    $this->postJson('/api/v1/auth/login', [
        'login' => 'ivan@example.com',
        'password' => 'secret123',
    ])
        ->assertStatus(422)
        ->assertJsonPath('code', 'auth.account_disabled');
});

it('records the login moment', function () {
    $user = User::factory()->create([
        'email' => 'ivan@example.com',
        'password' => bcrypt('secret123'),
    ]);

    $this->postJson('/api/v1/auth/login', [
        'login' => 'ivan@example.com',
        'password' => 'secret123',
    ]);

    expect($user->fresh()->last_login_at)->not->toBeNull();
});

it('requires a session for me', function () {
    $this->getJson('/api/v1/auth/me')->assertStatus(401);
});

it('returns the current account and person', function () {
    $user = actingAsUser();

    $this->getJson('/api/v1/auth/me')
        ->assertOk()
        ->assertJsonPath('user.id', $user->id)
        ->assertJsonPath('person.id', $user->person_id)
        ->assertJsonStructure([
            'permissions' => ['administrator', 'global', 'ministries'],
        ]);
});

it('logs out', function () {
    actingAsUser();

    $this->postJson('/api/v1/auth/logout')->assertNoContent();
    $this->assertGuest('web');
});
