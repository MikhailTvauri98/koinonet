<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    config()->set('session.driver', 'database');
    $this->withHeader('Origin', 'http://localhost');
});

/** @param array<string, mixed> $attributes */
function sessionRow(User $user, string $id, array $attributes = []): void
{
    DB::table('sessions')->insert([
        'id' => $id,
        'user_id' => $user->id,
        'ip_address' => '10.0.0.1',
        'user_agent' => 'Other',
        'payload' => '',
        'last_activity' => time(),
        ...$attributes,
    ]);
}

it('lists devices', function () {
    $current = keepSessionCookie();
    actingAsUser();
    $this->getJson('/api/v1/auth/me');

    $this->getJson('/api/v1/auth/sessions')
        ->assertOk()
        ->assertJsonStructure(['data' => [['id', 'ip_address', 'user_agent', 'last_activity', 'current']]])
        ->assertJsonPath('data.0.id', $current)
        ->assertJsonPath('data.0.current', true);
});

it('does not show the devices of other accounts', function () {
    keepSessionCookie();
    actingAsUser();
    sessionRow(User::factory()->create(), 'stranger-session');
    $this->getJson('/api/v1/auth/me');

    $this->getJson('/api/v1/auth/sessions')->assertOk()->assertJsonCount(1, 'data');
});

it('refuses to end the current session from the device list', function () {
    $current = keepSessionCookie();
    actingAsUser();
    $this->getJson('/api/v1/auth/me');

    $this->deleteJson("/api/v1/auth/sessions/{$current}")
        ->assertStatus(422)->assertJsonPath('code', 'session.current_cannot_be_revoked');
});

it('ends the session of another device', function () {
    $user = actingAsUser();
    sessionRow($user, 'other-session');

    $this->deleteJson('/api/v1/auth/sessions/other-session')->assertNoContent();

    expect(DB::table('sessions')->where('id', 'other-session')->exists())->toBeFalse();
});

it('refuses to end a session of another account', function () {
    actingAsUser();
    sessionRow(User::factory()->create(), 'stranger-session');

    $this->deleteJson('/api/v1/auth/sessions/stranger-session')->assertNotFound();

    expect(DB::table('sessions')->where('id', 'stranger-session')->exists())->toBeTrue();
});

it('ends all other sessions', function () {
    $current = keepSessionCookie();
    $user = actingAsUser();
    $this->getJson('/api/v1/auth/me');
    sessionRow($user, 'other-session');

    $this->postJson('/api/v1/auth/sessions/logout-others')->assertNoContent();

    expect(DB::table('sessions')->where('id', 'other-session')->exists())->toBeFalse()
        ->and(DB::table('sessions')->where('id', $current)->exists())->toBeTrue();
});

it('denies disabling an account without people.invite', function () {
    actingAsUser();
    $person = Person::factory()->has(User::factory())->create();

    $this->postJson("/api/v1/people/{$person->id}/disable")->assertForbidden();
});

it('denies enabling an account without people.invite', function () {
    actingAsUser();
    $person = Person::factory()->create();
    User::factory()->for($person)->create(['disabled_at' => now()]);

    $this->postJson("/api/v1/people/{$person->id}/enable")->assertForbidden();
});

it('disables an account, drops its sessions and empties its permissions', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->create();
    $person->globalRoles()->attach(Role::factory()->system()->create());
    $victim = User::factory()->for($person)->create();
    sessionRow($victim, 'victim-session');

    $this->postJson("/api/v1/people/{$person->id}/disable")->assertOk();

    expect($victim->fresh()->disabled_at)->not->toBeNull()
        ->and(DB::table('sessions')->where('id', 'victim-session')->exists())->toBeFalse()
        ->and(app(PermissionResolver::class)->for($victim->fresh())->global)->toBeEmpty();
});

it('refuses to disable a person without an account', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->create();

    $this->postJson("/api/v1/people/{$person->id}/disable")
        ->assertStatus(422)->assertJsonPath('code', 'user.no_account');
});

it('enables a disabled account again', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->create();
    $victim = User::factory()->for($person)->create(['disabled_at' => now()]);

    $this->postJson("/api/v1/people/{$person->id}/enable")->assertOk();

    expect($victim->fresh()->disabled_at)->toBeNull();
});

it('refuses to enable an account that is not disabled', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->has(User::factory())->create();

    $this->postJson("/api/v1/people/{$person->id}/enable")
        ->assertStatus(422)->assertJsonPath('code', 'user.not_disabled');
});

it('records disabling and enabling in the journal', function () {
    $actor = actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->create();
    $victim = User::factory()->for($person)->create();

    $this->postJson("/api/v1/people/{$person->id}/disable")->assertOk();
    $this->postJson("/api/v1/people/{$person->id}/enable")->assertOk();

    $entries = AuditEntry::query()->orderBy('created_at')->get();

    expect($entries->pluck('action')->all())->toBe(['user.disabled', 'user.enabled'])
        ->and($entries->pluck('actor_user_id')->unique()->all())->toBe([$actor->id])
        ->and($entries->pluck('subject_id')->unique()->all())->toBe([$victim->id]);
});
