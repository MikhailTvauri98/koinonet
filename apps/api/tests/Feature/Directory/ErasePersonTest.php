<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Directory\AccessLinkKind;
use App\Modules\Directory\Events\PersonErased;
use App\Modules\Directory\Models\AccessLink;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

it('erases personal data but keeps the history', function () {
    $person = Person::factory()->create([
        'last_name' => 'Иванов',
        'first_name' => 'Иван',
        'patronymic' => 'Иванович',
        'phone' => '+79123456789',
        'email' => 'ivan@example.com',
        'birth_date' => '1990-01-01',
        'note' => 'заметка',
        'contacts_public' => true,
    ]);
    $person->globalRoles()->attach(Role::factory()->global()->create());
    $user = User::factory()->for($person)->create();

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    $person->refresh();

    expect($person->last_name)->toBe('Удалённый человек')
        ->and($person->first_name)->toBe('')
        ->and($person->patronymic)->toBeNull()
        ->and($person->phone)->toBeNull()
        ->and($person->email)->toBeNull()
        ->and($person->birth_date)->toBeNull()
        ->and($person->note)->toBeNull()
        ->and($person->contacts_public)->toBeFalse()
        ->and($person->archived_at)->not->toBeNull()
        ->and(User::query()->find($user->id))->toBeNull()
        ->and($person->globalRoles()->count())->toBe(1);
});

it('drops the sessions of the erased account', function () {
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    DB::table('sessions')->insert([
        'id' => 'erased-session',
        'user_id' => $user->id,
        'ip_address' => '10.0.0.1',
        'user_agent' => 'Phone',
        'payload' => '',
        'last_activity' => time(),
    ]);

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    expect(DB::table('sessions')->where('id', 'erased-session')->exists())->toBeFalse();
});

it('drops the access links of the erased person and unlinks the ones the account created', function () {
    $author = Person::factory()->create();
    $authorUser = User::factory()->for($author)->create();
    $other = Person::factory()->create();

    AccessLink::query()->create([
        'person_id' => $author->id,
        'kind' => AccessLinkKind::PasswordReset,
        'token_hash' => hash('sha256', 'own'),
        'created_by_user_id' => $authorUser->id,
        'expires_at' => now()->addDay(),
        'created_at' => now(),
    ]);
    AccessLink::query()->create([
        'person_id' => $other->id,
        'kind' => AccessLinkKind::Invite,
        'token_hash' => hash('sha256', 'made-by-author'),
        'created_by_user_id' => $authorUser->id,
        'expires_at' => now()->addDay(),
        'created_at' => now(),
    ]);

    $this->artisan('people:erase', ['id' => $author->id, '--force' => true])->assertSuccessful();

    expect(AccessLink::query()->where('person_id', $author->id)->exists())->toBeFalse()
        ->and(AccessLink::query()->where('person_id', $other->id)->sole()->created_by_user_id)->toBeNull();
});

it('writes erasure to the journal without an actor', function () {
    $person = Person::factory()->create();

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    $entry = AuditEntry::query()->where('action', 'person.erased')->sole();

    expect($entry->actor_user_id)->toBeNull()
        ->and($entry->subject_id)->toBe($person->id);
});

it('publishes the erasure event', function () {
    Event::fake([PersonErased::class]);
    $person = Person::factory()->create();

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    Event::assertDispatched(PersonErased::class);
});

it('fails on an unknown person', function () {
    $this->artisan('people:erase', ['id' => '01JQZ0000000000000000000ZZ', '--force' => true])
        ->assertFailed();
});

it('does nothing without a confirmation', function () {
    $person = Person::factory()->create(['last_name' => 'Иванов']);

    $this->artisan('people:erase', ['id' => $person->id])
        ->expectsConfirmation('Стереть персональные данные безвозвратно?', 'no')
        ->assertFailed();

    expect($person->fresh()->last_name)->toBe('Иванов');
});
