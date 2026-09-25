<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    config()->set('session.driver', 'database');
    $this->withHeader('Origin', 'http://localhost');
});

it('reads its own contacts and contacts_public without any permission', function () {
    $user = actingAsUser(Person::factory()->create([
        'phone' => '+79123456789', 'email' => null, 'birth_date' => '1990-05-01', 'contacts_public' => true,
    ]));

    $this->getJson('/api/v1/me/profile')
        ->assertOk()
        ->assertJson(['data' => [
            'contacts' => ['phone' => '+79123456789', 'email' => null, 'birth_date' => '1990-05-01'],
            'contacts_public' => true,
        ]]);

    expect($user)->not->toBeNull();
});

it('requires a session to read the profile', function () {
    $this->getJson('/api/v1/me/profile')->assertStatus(401);
});

it('reads back the contacts_public flag just changed through the profile', function () {
    actingAsUser();

    $this->patchJson('/api/v1/me/profile', ['contacts_public' => true])->assertOk();

    $this->getJson('/api/v1/me/profile')->assertOk()->assertJsonPath('data.contacts_public', true);
});

it('lets anyone edit their own contacts without permissions and leaves the login alone', function () {
    $user = actingAsUser();
    $login = $user->email;

    $this->patchJson('/api/v1/me/profile', [
        'phone' => '8 912 345 67 89',
        'birth_date' => '1990-05-01',
        'contacts_public' => true,
    ])->assertOk();

    expect($user->person->fresh()->phone)->toBe('+79123456789')
        ->and($user->person->fresh()->birth_date->format('Y-m-d'))->toBe('1990-05-01')
        ->and($user->person->fresh()->contacts_public)->toBeTrue()
        ->and($user->fresh()->email)->toBe($login)
        ->and($user->fresh()->phone)->toBeNull();
});

it('refuses to change the name through the profile', function () {
    actingAsUser();

    $this->patchJson('/api/v1/me/profile', ['last_name' => 'Другой'])
        ->assertStatus(422)->assertJsonValidationErrors('last_name');
});

it('refuses to change the status through the profile', function () {
    actingAsUser();

    $this->patchJson('/api/v1/me/profile', ['status' => 'member'])
        ->assertStatus(422)->assertJsonValidationErrors('status');
});

it('changes the login with the current password and leaves person contacts alone', function () {
    $user = actingAsUser(Person::factory()->create(['email' => 'contact@example.com']));

    $this->patchJson('/api/v1/me/login', ['login' => 'New@Example.com', 'current_password' => 'password'])
        ->assertOk();

    expect($user->fresh()->email)->toBe('new@example.com')
        ->and($user->person->fresh()->email)->toBe('contact@example.com');
});

it('accepts a phone as the new login and normalises it', function () {
    $user = actingAsUser();

    $this->patchJson('/api/v1/me/login', ['login' => '8 912 345 67 89', 'current_password' => 'password'])
        ->assertOk();

    expect($user->fresh()->phone)->toBe('+79123456789')
        ->and($user->fresh()->email)->toBeNull();
});

it('refuses a login change with a wrong current password', function () {
    actingAsUser();

    $this->patchJson('/api/v1/me/login', ['login' => 'new@example.com', 'current_password' => 'wrong'])
        ->assertStatus(422)->assertJsonPath('code', 'auth.invalid_password');
});

it('refuses a login already taken', function () {
    actingAsUser();
    User::factory()->create(['email' => 'taken@example.com']);

    $this->patchJson('/api/v1/me/login', ['login' => 'taken@example.com', 'current_password' => 'password'])
        ->assertStatus(422)->assertJsonPath('code', 'login.taken');
});

it('records the login change in the journal', function () {
    $user = actingAsUser();

    $this->patchJson('/api/v1/me/login', ['login' => 'new@example.com', 'current_password' => 'password'])
        ->assertOk();

    $entry = AuditEntry::query()->sole();

    expect($entry->action)->toBe('user.login_changed')
        ->and($entry->actor_user_id)->toBe($user->id)
        ->and($entry->subject_id)->toBe($user->id);
});

it('changes the password and ends the other sessions', function () {
    $user = actingAsUser();
    $current = keepSessionCookie();
    $this->getJson('/api/v1/auth/me');
    DB::table('sessions')->insert([
        'id' => 'other-session', 'user_id' => $user->id, 'ip_address' => '10.0.0.1',
        'user_agent' => 'Other', 'payload' => '', 'last_activity' => time(),
    ]);

    $this->patchJson('/api/v1/me/password', [
        'current_password' => 'password',
        'password' => 'new-secret-123',
        'password_confirmation' => 'new-secret-123',
    ])->assertOk();

    expect(Hash::check('new-secret-123', $user->fresh()->password))->toBeTrue()
        ->and(DB::table('sessions')->where('id', 'other-session')->exists())->toBeFalse()
        ->and(DB::table('sessions')->where('id', $current)->exists())->toBeTrue();
});

it('refuses a password change with a wrong current password', function () {
    $user = actingAsUser();

    $this->patchJson('/api/v1/me/password', [
        'current_password' => 'wrong',
        'password' => 'new-secret-123',
        'password_confirmation' => 'new-secret-123',
    ])->assertStatus(422)->assertJsonPath('code', 'auth.invalid_password');

    expect(Hash::check('password', $user->fresh()->password))->toBeTrue();
});

it('cuts the remember-me tokens when the password changes', function () {
    $user = actingAsUser(attributes: ['remember_token' => 'old-token']);
    keepSessionCookie();
    $this->getJson('/api/v1/auth/me');

    $this->patchJson('/api/v1/me/password', [
        'current_password' => 'password',
        'password' => 'new-secret-123',
        'password_confirmation' => 'new-secret-123',
    ])->assertOk();

    expect($user->fresh()->remember_token)->not->toBe('old-token');
});
