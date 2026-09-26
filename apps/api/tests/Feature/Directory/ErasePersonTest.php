<?php

declare(strict_types=1);

use App\Modules\Access\Actions\SetPersonRoles;
use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\PersonRole;
use App\Modules\Access\Models\Role;
use App\Modules\Directory\AccessLinkKind;
use App\Modules\Directory\Contracts\AccountEraser;
use App\Modules\Directory\Events\PersonErased;
use App\Modules\Directory\Models\AccessLink;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Media\MediaAccess;
use App\Modules\Media\Models\Media;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;

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

it('erases a person with their own photo: the card loses it and the cleanup removes the file', function () {
    Storage::fake('media');
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $photo = Media::factory()->create([
        'uploader_user_id' => $user->id,
        'path' => '2026/09/own.jpg',
        'variants' => ['thumb' => '2026/09/own_thumb.webp'],
        'created_at' => now()->subHour(),
    ]);
    Storage::disk('media')->put('2026/09/own.jpg', 'bytes');
    Storage::disk('media')->put('2026/09/own_thumb.webp', 'bytes');
    $person->forceFill(['photo_media_id' => $photo->id])->save();
    $viewer = User::factory()->for(Person::factory()->create())->create();
    $viewer->person->globalRoles()->attach(Role::factory()->system()->create());

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    expect($person->fresh()->photo_media_id)->toBeNull()
        ->and($photo->fresh()->uploader_user_id)->toBeNull()
        ->and(app(MediaAccess::class)->canView($viewer, $photo->fresh()))->toBeFalse();

    $this->artisan('media:prune')->assertSuccessful();

    expect(Media::query()->find($photo->id))->toBeNull();
    Storage::disk('media')->assertMissing(['2026/09/own.jpg', '2026/09/own_thumb.webp']);
});

it('erases a person whose photo another account uploaded', function () {
    Storage::fake('media');
    $person = Person::factory()->create();
    $photo = Media::factory()->create(['path' => '2026/09/by-admin.jpg', 'created_at' => now()->subDays(2)]);
    Storage::disk('media')->put('2026/09/by-admin.jpg', 'bytes');
    $person->forceFill(['photo_media_id' => $photo->id])->save();

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    expect($person->fresh()->photo_media_id)->toBeNull();

    $this->artisan('media:prune')->assertSuccessful();

    expect(Media::query()->find($photo->id))->toBeNull();
});

it('erases an account with an unattached upload, which the next cleanup removes regardless of its age', function () {
    Storage::fake('media');
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $upload = Media::factory()->create([
        'uploader_user_id' => $user->id, 'path' => '2026/09/fresh.pdf', 'created_at' => now()->subMinutes(5),
    ]);
    Storage::disk('media')->put('2026/09/fresh.pdf', 'bytes');

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    expect(User::query()->find($user->id))->toBeNull()
        ->and($upload->fresh()->uploader_user_id)->toBeNull();

    $this->artisan('media:prune')->assertSuccessful();

    expect(Media::query()->find($upload->id))->toBeNull();
    Storage::disk('media')->assertMissing('2026/09/fresh.pdf');
});

it('keeps a ministry cover the erased account set, without a link to the account', function () {
    Storage::fake('media');
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $ministry = ministryWithRoles();
    $cover = Media::factory()->create([
        'uploader_user_id' => $user->id, 'path' => '2026/09/cover.jpg', 'created_at' => now()->subDays(2),
    ]);
    Storage::disk('media')->put('2026/09/cover.jpg', 'bytes');
    $ministry->forceFill(['cover_media_id' => $cover->id])->save();

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();
    $this->artisan('media:prune')->assertSuccessful();

    expect($ministry->fresh()->cover_media_id)->toBe($cover->id)
        ->and($cover->fresh()->uploader_user_id)->toBeNull();
    Storage::disk('media')->assertExists('2026/09/cover.jpg');
});

it('leaves the media of other people alone', function () {
    Storage::fake('media');
    $person = Person::factory()->create();
    User::factory()->for($person)->create();
    $other = Person::factory()->create();
    $otherUser = User::factory()->for($other)->create();
    $otherPhoto = Media::factory()->create(['uploader_user_id' => $otherUser->id, 'created_at' => now()->subDays(2)]);
    $other->forceFill(['photo_media_id' => $otherPhoto->id])->save();
    $otherUpload = Media::factory()->create(['uploader_user_id' => $otherUser->id, 'created_at' => now()->subHour()]);

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();
    $this->artisan('media:prune')->assertSuccessful();

    expect($other->fresh()->photo_media_id)->toBe($otherPhoto->id)
        ->and($otherPhoto->fresh()->uploader_user_id)->toBe($otherUser->id)
        ->and($otherUpload->fresh()?->uploader_user_id)->toBe($otherUser->id);
});

it('unlinks the erased account from the roles it granted and the members it added', function () {
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $this->actingAs($user, 'web');
    $granted = Person::factory()->create();
    app(SetPersonRoles::class)->handle($granted, [Role::factory()->global()->create()->id]);
    $ministry = ministryWithRoles();
    $added = memberOf($ministry, Person::factory()->create());
    auth()->guard('web')->logout();

    expect(PersonRole::query()->where('person_id', $granted->id)->sole()->assigned_by_user_id)->toBe($user->id)
        ->and($added->fresh()->added_by_user_id)->toBe($user->id);

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    expect(PersonRole::query()->where('person_id', $granted->id)->sole()->assigned_by_user_id)->toBeNull()
        ->and($added->fresh()->added_by_user_id)->toBeNull();
});

it('calls every registered account eraser before deleting the account', function () {
    $person = Person::factory()->create();
    $user = User::factory()->for($person)->create();
    $eraser = new class implements AccountEraser
    {
        /** @var list<array{string, bool}> */
        public array $calls = [];

        public function eraseAccount(string $userId): void
        {
            $this->calls[] = [$userId, User::query()->whereKey($userId)->exists()];
        }
    };
    app()->instance('test.account_eraser', $eraser);
    app()->tag(['test.account_eraser'], 'directory.account_erasers');

    $this->artisan('people:erase', ['id' => $person->id, '--force' => true])->assertSuccessful();

    expect($eraser->calls)->toBe([[$user->id, true]]);
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
