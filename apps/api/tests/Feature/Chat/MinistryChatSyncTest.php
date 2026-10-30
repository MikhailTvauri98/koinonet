<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Chat\Actions\CreateMinistryChat;
use App\Modules\Chat\Events\ChatMembersChanged;
use App\Modules\Chat\Listeners\AddNewUserToChats;
use App\Modules\Chat\Listeners\CreateMinistryChatOnCreated;
use App\Modules\Chat\Listeners\SyncMinistryChatOnMembership;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Events\UserCreated;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Actions\RemoveMember;
use App\Modules\Ministries\Events\MemberAdded;
use App\Modules\Ministries\Events\MemberRemoved;
use App\Modules\Ministries\Events\MinistryArchived;
use App\Modules\Ministries\Events\MinistryCreated;
use App\Modules\Ministries\Models\Ministry;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;

uses(RefreshDatabase::class);

it('documents the ministry chat id as a required nullable string', function () {
    $schema = app(Generator::class)();
    $resource = $schema['components']['schemas']['MinistryResource'];
    expect($resource['properties']['chat_id']['type'])->toBe(['string', 'null'])
        ->and($resource['required'])->toContain('chat_id');
});

function ministryChat(Ministry $ministry): Chat
{
    return Chat::query()->where('ministry_id', $ministry->id)->sole();
}

it('creates a ministry chat and exposes its id without storing its title', function () {
    actingAsUserWith([Permission::MinistriesCreate, Permission::MinistriesViewAll]);
    $id = $this->postJson('/api/v1/ministries', ['name' => 'Прославление'])->assertCreated()->json('data.id');
    $chat = Chat::query()->where('ministry_id', $id)->sole();
    expect($chat->type->value)->toBe('ministry')->and($chat->title)->toBeNull()->and($chat->members)->toHaveCount(0);
    $this->getJson("/api/v1/ministries/{$id}")->assertJsonPath('data.chat_id', $chat->id);
});

it('adds and removes accounts and emits membership changes only once', function () {
    $ministry = ministryWithRoles();
    $user = User::factory()->create();
    Event::fake([ChatMembersChanged::class]);
    $member = memberOf($ministry, $user->person);
    $chat = ministryChat($ministry);
    app(SyncMinistryChatOnMembership::class)->handle(new MemberAdded($ministry->id, $user->person_id, $user->id));
    expect($chat->members()->where('user_id', $user->id)->count())->toBe(1);
    Event::assertDispatched(ChatMembersChanged::class, fn ($event) => $event->chatId === $chat->id && $event->added === [$user->id] && $event->removed === []);
    app(RemoveMember::class)->handle($ministry, $member);
    app(SyncMinistryChatOnMembership::class)->handle(new MemberRemoved($ministry->id, $user->person_id, $user->id));
    expect($chat->members()->count())->toBe(0);
    Event::assertDispatchedTimes(ChatMembersChanged::class, 2);
});

it('catches up an account created after membership and ignores stale queue deliveries', function () {
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $member = memberOf($ministry, $person);
    expect(ministryChat($ministry)->members()->count())->toBe(0);
    $user = User::factory()->for($person)->create();
    UserCreated::dispatch($user->id, $person->id);
    expect(ministryChat($ministry)->members()->count())->toBe(1);
    app(RemoveMember::class)->handle($ministry, $member);
    app(SyncMinistryChatOnMembership::class)->handle(new MemberAdded($ministry->id, $person->id, $user->id));
    app(AddNewUserToChats::class)->handle(new UserCreated($user->id, $person->id));
    expect(ministryChat($ministry)->members()->count())->toBe(0);
    memberOf($ministry, $person);
    app(SyncMinistryChatOnMembership::class)->handle(new MemberRemoved($ministry->id, $person->id, $user->id));
    expect(ministryChat($ministry)->members()->count())->toBe(1);
});

it('archives a ministry chat once with a system actor', function () {
    $ministry = ministryWithRoles();
    actingAsUserWith([Permission::MinistriesCreate]);
    $this->postJson("/api/v1/ministries/{$ministry->id}/archive")->assertOk();
    MinistryArchived::dispatch($ministry->id);
    expect(ministryChat($ministry)->archived_at)->not->toBeNull();
    $entry = AuditEntry::query()->where('action', 'chat.archived')->sole();
    expect($entry->actor_user_id)->toBeNull()->and($entry->subject_id)->toBe(ministryChat($ministry)->id);
});

it('catches up ministry chats when an invitation is accepted', function () {
    $this->withHeader('Origin', 'http://localhost');
    $ministry = ministryWithRoles();
    $person = Person::factory()->create();
    $person->globalRoles()->attach(Role::factory()->global()->create());
    memberOf($ministry, $person);
    actingAsUserWith([Permission::PeopleInvite]);
    $token = str((string) $this->postJson("/api/v1/people/{$person->id}/invite")->assertCreated()->json('data.url'))->afterLast('/')->toString();
    auth('web')->logout();
    $this->postJson("/api/v1/access-links/{$token}/accept", ['login' => 'new@example.com', 'password' => 'secret123', 'password_confirmation' => 'secret123'])->assertCreated();
    expect(ministryChat($ministry)->members()->sole()->user_id)->toBe($person->fresh()->user->id);
});

it('does not create a chat or emit changes for a rolled back source transaction', function () {
    Event::fake([ChatMembersChanged::class]);
    DB::beginTransaction();
    $ministry = ministryWithRoles();
    expect(Chat::query()->where('ministry_id', $ministry->id)->exists())->toBeFalse();
    DB::rollBack();
    expect(Chat::query()->where('ministry_id', $ministry->id)->exists())->toBeFalse();
    Event::assertNotDispatched(ChatMembersChanged::class);
});

it('reconciles current members when ministry creation is delivered late', function () {
    Event::fake([MinistryCreated::class]);
    $ministry = ministryWithRoles();
    $user = User::factory()->create();
    memberOf($ministry, $user->person);
    app(CreateMinistryChatOnCreated::class)->handle(new MinistryCreated($ministry->id));
    expect(ministryChat($ministry)->members()->sole()->user_id)->toBe($user->id);
    $other = ministryWithRoles('Архивное');
    $other->update(['archived_at' => now()]);
    app(CreateMinistryChatOnCreated::class)->handle(new MinistryCreated($other->id));
    expect(Chat::query()->where('ministry_id', $other->id)->exists())->toBeFalse();
});

it('backfills missing chats and missing members of existing chats idempotently', function () {
    $missing = Ministry::factory()->create();
    $existing = ministryWithRoles();
    $user = User::factory()->create();
    memberOf($existing, $user->person);
    ministryChat($existing)->members()->delete();
    $this->artisan('chat:backfill')->assertSuccessful();
    $this->artisan('chat:backfill')->assertSuccessful();
    expect(Chat::query()->where('ministry_id', $missing->id)->count())->toBe(1)
        ->and(ministryChat($existing)->members()->where('user_id', $user->id)->count())->toBe(1)
        ->and(app(CreateMinistryChat::class)->handle($existing)->id)->toBe(ministryChat($existing)->id);
});

it('does not backfill archived ministries or disabled accounts and archived people', function () {
    $archived = Ministry::factory()->create(['archived_at' => now()]);
    $ministry = ministryWithRoles();
    $disabled = User::factory()->create(['disabled_at' => now()]);
    memberOf($ministry, $disabled->person);
    $user = User::factory()->create();
    memberOf($ministry, $user->person);
    ministryChat($ministry)->members()->delete();
    $user->person->update(['archived_at' => now()]);
    UserCreated::dispatch($disabled->id, $disabled->person_id);
    $this->artisan('chat:backfill')->assertSuccessful();
    expect(Chat::query()->where('ministry_id', $archived->id)->exists())->toBeFalse()
        ->and(ministryChat($ministry)->members()->count())->toBe(0);
});
