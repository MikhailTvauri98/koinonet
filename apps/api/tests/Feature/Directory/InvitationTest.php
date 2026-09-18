<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Directory\AccessLinkKind;
use App\Modules\Directory\Events\UserCreated;
use App\Modules\Directory\Models\AccessLink;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    $this->withHeader('Origin', 'http://localhost');
});

/** @param array<string, mixed> $attributes */
function personWithRole(array $attributes = []): Person
{
    $person = Person::factory()->create($attributes);
    $person->globalRoles()->attach(Role::factory()->global()->create());

    return $person;
}

it('denies invitations without people.invite', function () {
    actingAsUserWith([Permission::PeopleManage]);

    $this->postJson('/api/v1/people/'.personWithRole()->id.'/invite')->assertForbidden();
});

it('denies password reset links without people.invite', function () {
    actingAsUserWith([Permission::PeopleManage]);
    $person = personWithRole();
    User::factory()->for($person)->create();

    $this->postJson("/api/v1/people/{$person->id}/password-reset-link")->assertForbidden();
});

it('creates an invitation with a seven day expiry and stores only its token hash', function () {
    $actor = actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();
    $this->freezeTime();

    $response = $this->postJson("/api/v1/people/{$person->id}/invite")
        ->assertCreated()
        ->assertJsonStructure(['data' => ['url', 'expires_at']]);

    $url = (string) $response->json('data.url');
    $token = str($url)->afterLast('/')->toString();
    $link = AccessLink::query()->sole();

    expect($url)->toContain('/invite/')
        ->and($link->token_hash)->toBe(hash('sha256', $token))
        ->and($link->token_hash)->not->toBe($token)
        ->and($link->kind)->toBe(AccessLinkKind::Invite)
        ->and($link->created_by_user_id)->toBe($actor->id)
        ->and($link->expires_at->timestamp)->toBe(now()->addDays(7)->timestamp);

    expect(AuditEntry::query()->where('action', 'person.invited')->where('subject_id', $person->id)->exists())
        ->toBeTrue();
});

it('refuses to invite a person without a global role', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = Person::factory()->create();

    $this->postJson("/api/v1/people/{$person->id}/invite")
        ->assertStatus(422)
        ->assertJsonPath('code', 'invite.person_has_no_global_role');
});

it('refuses to invite a person who already has an account', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();
    User::factory()->for($person)->create();

    $this->postJson("/api/v1/people/{$person->id}/invite")
        ->assertStatus(422)
        ->assertJsonPath('code', 'invite.person_has_account');
});

it('refuses to invite an archived person', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole(['archived_at' => now()]);

    $this->postJson("/api/v1/people/{$person->id}/invite")
        ->assertStatus(422)
        ->assertJsonPath('code', 'invite.person_archived');
});

it('revokes only previous unused invitations for the same person', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();
    $otherPerson = personWithRole();
    $otherPersonLink = AccessLink::factory()->for($otherPerson)->create();
    $passwordReset = AccessLink::factory()
        ->for($person)
        ->kind(AccessLinkKind::PasswordReset)
        ->create();

    $this->postJson("/api/v1/people/{$person->id}/invite")->assertCreated();
    $this->postJson("/api/v1/people/{$person->id}/invite")->assertCreated();

    expect(AccessLink::query()
        ->where('person_id', $person->id)
        ->where('kind', AccessLinkKind::Invite)
        ->whereNotNull('revoked_at')
        ->count())->toBe(1)
        ->and($otherPersonLink->fresh()->revoked_at)->toBeNull()
        ->and($passwordReset->fresh()->revoked_at)->toBeNull();
});

it('shows the invited person their name and login hints without a session', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole([
        'first_name' => 'Мария',
        'last_name' => 'Петрова',
        'phone' => '+79123456789',
        'email' => 'maria@example.com',
    ]);
    $url = $this->postJson("/api/v1/people/{$person->id}/invite")->json('data.url');
    $token = str((string) $url)->afterLast('/')->toString();

    Auth::guard('web')->logout();

    $this->getJson("/api/v1/access-links/{$token}")
        ->assertOk()
        ->assertJsonPath('data.person.first_name', 'Мария')
        ->assertJsonPath('data.person.last_name', 'Петрова')
        ->assertJsonPath('data.kind', 'invite')
        ->assertJsonPath('data.login_hint.phone', '+79123456789')
        ->assertJsonPath('data.login_hint.email', 'maria@example.com');
});

it('refuses an unknown token', function () {
    $this->getJson('/api/v1/access-links/not-a-real-token')
        ->assertStatus(422)
        ->assertJsonPath('code', 'access_link.invalid');
});

it('refuses a used token', function () {
    $link = AccessLink::factory()->used()->create();

    $this->getJson("/api/v1/access-links/{$link->plain_token}")
        ->assertStatus(422)
        ->assertJsonPath('code', 'access_link.used');
});

it('refuses an expired token', function () {
    $link = AccessLink::factory()->expired()->create();

    $this->getJson("/api/v1/access-links/{$link->plain_token}")
        ->assertStatus(422)
        ->assertJsonPath('code', 'access_link.expired');
});

it('refuses a revoked token with its own error code', function () {
    $link = AccessLink::factory()->revoked()->create();

    $this->getJson("/api/v1/access-links/{$link->plain_token}")
        ->assertStatus(422)
        ->assertJsonPath('code', 'access_link.revoked');
});

it('creates an account from an invitation, emits the event and logs in', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole(['email' => 'maria@example.com']);
    $url = $this->postJson("/api/v1/people/{$person->id}/invite")->json('data.url');
    $token = str((string) $url)->afterLast('/')->toString();
    Auth::guard('web')->logout();
    Event::fake([UserCreated::class]);

    $this->postJson("/api/v1/access-links/{$token}/accept", [
        'login' => 'MARIA@example.com',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
    ])->assertCreated();

    $user = $person->fresh()->user;

    expect($user)->not->toBeNull()
        ->and($user?->email)->toBe('maria@example.com')
        ->and(AccessLink::query()->sole()->used_at)->not->toBeNull();
    $this->assertAuthenticatedAs($user, 'web');
    Event::assertDispatched(
        UserCreated::class,
        fn (UserCreated $event): bool => $event->userId === $user?->id
            && $event->personId === $person->id,
    );
});

it('creates an account with a normalised phone login', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole(['phone' => '+79123456789']);
    $url = $this->postJson("/api/v1/people/{$person->id}/invite")->json('data.url');
    $token = str((string) $url)->afterLast('/')->toString();
    Auth::guard('web')->logout();

    $this->postJson("/api/v1/access-links/{$token}/accept", [
        'login' => '8 912 345 67 89',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
    ])->assertCreated();

    expect($person->fresh()->user?->phone)->toBe('+79123456789');
});

it('refuses a login already taken by another account', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    User::factory()->create(['email' => 'maria@example.com']);
    $person = personWithRole();
    $url = $this->postJson("/api/v1/people/{$person->id}/invite")->json('data.url');
    $token = str((string) $url)->afterLast('/')->toString();
    Auth::guard('web')->logout();

    $this->postJson("/api/v1/access-links/{$token}/accept", [
        'login' => 'MARIA@example.com',
        'password' => 'secret123',
        'password_confirmation' => 'secret123',
    ])->assertStatus(422)->assertJsonPath('code', 'login.taken');

    expect($person->fresh()->user)->toBeNull();
});

it('creates a password reset link with a one day expiry and writes the journal', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();
    User::factory()->for($person)->create();
    $this->freezeTime();

    $this->postJson("/api/v1/people/{$person->id}/password-reset-link")
        ->assertCreated()
        ->assertJsonStructure(['data' => ['url', 'expires_at']]);

    $link = AccessLink::query()->sole();

    expect($link->kind)->toBe(AccessLinkKind::PasswordReset)
        ->and($link->expires_at->timestamp)->toBe(now()->addDay()->timestamp)
        ->and(AuditEntry::query()
            ->where('action', 'person.password_reset_link_created')
            ->where('subject_id', $person->id)
            ->exists())->toBeTrue();
});

it('refuses a password reset link for a person without an account', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();

    $this->postJson("/api/v1/people/{$person->id}/password-reset-link")
        ->assertUnprocessable()
        ->assertJsonPath('code', 'password_reset.person_has_no_account');
});

it('revokes the previous unused password reset link', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();
    User::factory()->for($person)->create();

    $this->postJson("/api/v1/people/{$person->id}/password-reset-link")->assertCreated();
    $this->postJson("/api/v1/people/{$person->id}/password-reset-link")->assertCreated();

    expect(AccessLink::query()
        ->where('person_id', $person->id)
        ->where('kind', AccessLinkKind::PasswordReset)
        ->whereNotNull('revoked_at')
        ->count())->toBe(1);
});

it('resets a password, consumes the link and ends existing sessions', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();
    $user = User::factory()->for($person)->create(['password' => bcrypt('old-password')]);
    DB::table('sessions')->insert([
        [
            'id' => 'first-session',
            'user_id' => $user->id,
            'ip_address' => null,
            'user_agent' => null,
            'payload' => 'payload',
            'last_activity' => now()->timestamp,
        ],
        [
            'id' => 'second-session',
            'user_id' => $user->id,
            'ip_address' => null,
            'user_agent' => null,
            'payload' => 'payload',
            'last_activity' => now()->timestamp,
        ],
    ]);
    $url = $this->postJson("/api/v1/people/{$person->id}/password-reset-link")->json('data.url');
    $token = str((string) $url)->afterLast('/')->toString();
    Auth::guard('web')->logout();

    $this->postJson("/api/v1/access-links/{$token}/accept", [
        'password' => 'new-password',
        'password_confirmation' => 'new-password',
    ])->assertOk();

    expect(Hash::check('new-password', $user->fresh()->password))->toBeTrue()
        ->and(AccessLink::query()->sole()->used_at)->not->toBeNull()
        ->and(DB::table('sessions')->where('user_id', $user->id)->count())->toBe(0);
});

it('does not accept a replacement login through a password reset link', function () {
    actingAsUserWith([Permission::PeopleInvite]);
    $person = personWithRole();
    User::factory()->for($person)->create(['email' => 'old@example.com']);
    $url = $this->postJson("/api/v1/people/{$person->id}/password-reset-link")->json('data.url');
    $token = str((string) $url)->afterLast('/')->toString();
    Auth::guard('web')->logout();

    $this->postJson("/api/v1/access-links/{$token}/accept", [
        'login' => 'new@example.com',
        'password' => 'new-password',
        'password_confirmation' => 'new-password',
    ])->assertUnprocessable()->assertJsonValidationErrors('login');

    expect($person->fresh()->user?->email)->toBe('old@example.com');
});
