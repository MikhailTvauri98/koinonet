<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Events\AssignmentCreated;
use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Chat\Actions\CreateEventChat;
use App\Modules\Chat\Events\ChatMembersChanged;
use App\Modules\Chat\Listeners\SyncEventChatOnAssignment;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use Dedoc\Scramble\Generator;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event as Events;

uses(RefreshDatabase::class);

it('explicitly creates one event chat from active assignments plus its original creator', function () {
    $creator = actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create(['title' => 'Крещение']);
    expect(Chat::query()->where('event_id', $event->id)->exists())->toBeFalse();
    $this->getJson("/api/v1/events/{$event->id}")->assertJsonPath('data.chat_id', null);
    $slot = EventSlot::factory()->for($event)->create();
    $active = User::factory()->create();
    $disabled = User::factory()->create(['disabled_at' => now()]);
    $archived = User::factory()->create();
    $archived->person->update(['archived_at' => now()]);
    foreach ([$active->person, $disabled->person, $archived->person, Person::factory()->create()] as $person) {
        EventAssignment::factory()->for($slot)->for($person)->create();
    }
    $removed = User::factory()->create();
    EventAssignment::factory()->for($slot)->for($removed->person)->create(['archived_at' => now()]);
    $oldSlot = EventSlot::factory()->for($event)->create(['archived_at' => now()]);
    EventAssignment::factory()->for($oldSlot)->for(User::factory()->create()->person)->create();
    $id = $this->postJson("/api/v1/events/{$event->id}/chat")->assertCreated()
        ->assertJsonPath('data.type', 'event')->assertJsonPath('data.title', 'Крещение')->json('data.id');
    $chat = Chat::query()->findOrFail($id);
    expect($chat->members()->pluck('user_id')->all())->toEqualCanonicalizing([$creator->id, $active->id]);
    expect($chat->title)->toBeNull()->and($chat->created_by_user_id)->toBe($creator->id);
    $this->postJson("/api/v1/events/{$event->id}/chat")->assertOk()->assertJsonPath('data.id', $id);
    $this->getJson("/api/v1/events/{$event->id}")->assertJsonPath('data.chat_id', $id);
    expect(Chat::query()->where('event_id', $event->id)->count())->toBe(1);
});

it('denies a nonmanager and rechecks a stale actor and event inside the Action', function () {
    actingAsUser();
    $event = Event::factory()->create();
    $this->postJson("/api/v1/events/{$event->id}/chat")->assertForbidden();
    $actor = actingAsUserWith([Permission::CalendarChurchManage]);
    User::query()->whereKey($actor->id)->update(['disabled_at' => now()]);
    expect(fn () => app(CreateEventChat::class)->handle($event, $actor))->toThrow(AuthorizationException::class);
    User::query()->whereKey($actor->id)->update(['disabled_at' => null]);
    Event::query()->whereKey($event->id)->update(['archived_at' => now()]);
    expect(fn () => app(CreateEventChat::class)->handle($event, $actor))->toThrow(AuthorizationException::class);
    expect(Chat::query()->count())->toBe(0);
});

it('keeps the creator after the last assignment and synchronizes active slots through real endpoints', function () {
    $creator = actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    $a = EventSlot::factory()->for($event)->create();
    $b = EventSlot::factory()->for($event)->create();
    $id = $this->postJson("/api/v1/events/{$event->id}/chat")->assertCreated()->json('data.id');
    $chat = Chat::query()->findOrFail($id);
    $user = User::factory()->create();
    $first = $this->postJson("/api/v1/slots/{$a->id}/assignments", ['person_id' => $user->person_id])->assertCreated()->json('data.id');
    $this->postJson("/api/v1/slots/{$b->id}/assignments", ['person_id' => $user->person_id])->assertCreated();
    expect($chat->members()->where('user_id', $user->id)->exists())->toBeTrue();
    $this->deleteJson("/api/v1/assignments/{$first}")->assertNoContent();
    expect($chat->members()->where('user_id', $user->id)->exists())->toBeTrue();
    $this->deleteJson("/api/v1/slots/{$b->id}")->assertNoContent();
    expect($chat->members()->where('user_id', $user->id)->exists())->toBeFalse();
    $assignment = $this->postJson("/api/v1/slots/{$a->id}/assignments", ['person_id' => $creator->person_id])->assertCreated()->json('data.id');
    $this->deleteJson("/api/v1/assignments/{$assignment}")->assertNoContent();
    expect($chat->members()->where('user_id', $creator->id)->exists())->toBeTrue();
});

it('reconciles reordered assignments from the current person account even when historical user id is null or wrong', function () {
    actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    $id = $this->postJson("/api/v1/events/{$event->id}/chat")->assertCreated()->json('data.id');
    $chat = Chat::query()->findOrFail($id);
    $slot = EventSlot::factory()->for($event)->create();
    $user = User::factory()->create();
    $assignment = EventAssignment::factory()->for($slot)->for($user->person)->create();
    Events::fake([ChatMembersChanged::class]);
    $listener = app(SyncEventChatOnAssignment::class);
    $listener->handle(new AssignmentRemoved($event->id, $slot->id, $user->person_id, null, null));
    expect($chat->members()->where('user_id', $user->id)->exists())->toBeTrue();
    $assignment->update(['archived_at' => now()]);
    $listener->handle(new AssignmentCreated($event->id, $slot->id, $user->person_id, User::factory()->create()->id, null));
    expect($chat->members()->where('user_id', $user->id)->exists())->toBeFalse();
    $assignment->update(['archived_at' => null]);
    $slot->update(['archived_at' => now()]);
    $listener->handle(new AssignmentCreated($event->id, $slot->id, $user->person_id, null, null));
    expect($chat->members()->where('user_id', $user->id)->exists())->toBeFalse();
    $slot->update(['archived_at' => null]);
    $user->update(['disabled_at' => now()]);
    $listener->handle(new AssignmentCreated($event->id, $slot->id, $user->person_id, null, null));
    expect($chat->members()->where('user_id', $user->id)->exists())->toBeFalse();
    Events::assertDispatchedTimes(ChatMembersChanged::class, 2);
});

it('lets ministry event managers create and moderate without relying on role names', function () {
    $ministry = ministryWithRoles();
    $manager = actingAsUser();
    $role = Role::factory()->ministry($ministry->id)->withPermissions([Permission::EventsManage])->create(['name' => 'Координатор']);
    memberOf($ministry, $manager->person, [$role->id]);
    $event = Event::factory()->ministry($ministry)->create();
    $id = $this->postJson("/api/v1/events/{$event->id}/chat")->assertCreated()->assertJsonPath('data.can_moderate', true)->json('data.id');
    $this->getJson("/api/v1/chats/{$id}")->assertOk()->assertJsonPath('data.can_write', true);
});

it('returns real unread on repeat and sanitizes messages for another manager without adding them', function () {
    $creator = actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    $id = $this->postJson("/api/v1/events/{$event->id}/chat")->assertCreated()->json('data.id');
    $chat = Chat::query()->findOrFail($id);
    $message = Message::factory()->for($chat)->create(['body' => 'Приватное сообщение']);
    $chat->update(['last_message_id' => $message->id, 'last_message_at' => $message->created_at]);
    $this->postJson("/api/v1/events/{$event->id}/chat")->assertOk()->assertJsonPath('data.unread_count', 1);
    app('auth')->forgetGuards();
    $other = actingAsUserWith([Permission::CalendarChurchManage]);
    $this->postJson("/api/v1/events/{$event->id}/chat")->assertOk()->assertJsonPath('data.last_message', null)
        ->assertJsonPath('data.last_message_at', null)->assertJsonPath('data.pinned_messages', [])
        ->assertJsonPath('data.unread_count', 0)->assertJsonPath('data.can_write', false)->assertJsonPath('data.can_moderate', true);
    expect($chat->members()->where('user_id', $other->id)->exists())->toBeFalse()
        ->and($chat->fresh()->created_by_user_id)->toBe($creator->id);
    $this->getJson("/api/v1/chats/{$id}")->assertForbidden();
    $this->deleteJson("/api/v1/messages/{$message->id}")->assertNoContent();
});

it('catches up invitation accounts only in existing scheduled active event chats and preserves ministry catchup', function () {
    $this->withHeader('Origin', 'http://localhost');
    actingAsUserWith([Permission::CalendarChurchManage, Permission::PeopleInvite]);
    $person = Person::factory()->create();
    $person->globalRoles()->attach(Role::factory()->global()->create());
    $ministry = ministryWithRoles();
    memberOf($ministry, $person);
    $eligible = [];
    $excluded = [];
    foreach (['scheduled', 'past', 'cancelled', 'archived', 'archived_slot', 'archived_assignment', 'no_chat', 'archived_chat', 'archived_parent'] as $case) {
        $event = Event::factory()->create($case === 'past' ? ['starts_at' => now()->subDays(2), 'ends_at' => now()->subDay()] : []);
        $chat = $case === 'no_chat' ? null : Chat::query()->findOrFail($this->postJson("/api/v1/events/{$event->id}/chat")->assertCreated()->json('data.id'));
        $slot = EventSlot::factory()->for($event)->create();
        $assignment = EventAssignment::factory()->for($slot)->for($person)->create();
        match ($case) {
            'cancelled' => $event->update(['status' => EventStatus::Cancelled]),
            'archived' => $event->update(['archived_at' => now()]),
            'archived_slot' => $slot->update(['archived_at' => now()]),
            'archived_assignment' => $assignment->update(['archived_at' => now()]),
            'archived_chat' => $chat->update(['archived_at' => now()]),
            'archived_parent' => $event->update(['owner_type' => 'ministry', 'ministry_id' => Ministry::factory()->create(['archived_at' => now()])->id]),
            default => null,
        };
        if ($chat !== null) {
            if (in_array($case, ['scheduled', 'past'], true)) {
                $eligible[] = $chat;
            } else {
                $excluded[] = $chat;
            }
        }
    }
    $token = str((string) $this->postJson("/api/v1/people/{$person->id}/invite")->assertCreated()->json('data.url'))->afterLast('/')->toString();
    auth('web')->logout();
    $this->postJson("/api/v1/access-links/{$token}/accept", ['login' => 'event@example.com', 'password' => 'secret123', 'password_confirmation' => 'secret123'])->assertCreated();
    $user = $person->fresh()->user;
    foreach ($eligible as $chat) {
        expect($chat->members()->where('user_id', $user->id)->exists())->toBeTrue();
    }
    foreach ($excluded as $chat) {
        expect($chat->members()->where('user_id', $user->id)->exists())->toBeFalse();
    }
    expect(Chat::query()->where('type', 'event')->count())->toBe(8)
        ->and(Chat::query()->where('ministry_id', $ministry->id)->sole()->members()->where('user_id', $user->id)->exists())->toBeTrue();
});

it('leaves cancellation independent from chats and rejects archived event parents', function () {
    actingAsUserWith([Permission::CalendarChurchManage, Permission::MinistriesManageAll]);
    $event = Event::factory()->create(['status' => EventStatus::Cancelled]);
    $chat = Chat::query()->findOrFail($this->postJson("/api/v1/events/{$event->id}/chat")->assertCreated()->json('data.id'));
    $user = User::factory()->create();
    $slot = EventSlot::factory()->for($event)->create();
    EventAssignment::factory()->for($slot)->for($user->person)->create();
    app(SyncEventChatOnAssignment::class)->handle(new AssignmentCreated($event->id, $slot->id, $user->person_id, null, null));
    expect($chat->members()->where('user_id', $user->id)->exists())->toBeTrue()->and($chat->fresh()->archived_at)->toBeNull();
    $slot->assignments()->update(['archived_at' => now()]);
    app(SyncEventChatOnAssignment::class)->handle(new AssignmentRemoved($event->id, $slot->id, $user->person_id, null, null));
    expect($chat->members()->where('user_id', $user->id)->exists())->toBeFalse();
    $this->postJson("/api/v1/chats/{$chat->id}/archive")->assertUnprocessable()->assertJsonPath('code', 'chat.archived_with_parent');
    $parent = Ministry::factory()->create(['archived_at' => now()]);
    $archived = Event::factory()->ministry($parent)->create();
    $this->postJson("/api/v1/events/{$archived->id}/chat")->assertForbidden();
});

it('does not create membership or emit membership changes for a rollback', function () {
    $actor = actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    Events::fake([ChatMembersChanged::class]);
    DB::beginTransaction();
    app(CreateEventChat::class)->handle($event, $actor);
    DB::rollBack();
    expect(Chat::query()->where('event_id', $event->id)->exists())->toBeFalse();
    Events::assertNotDispatched(ChatMembersChanged::class);
});

it('documents nullable event chat linkage and both idempotent response statuses', function () {
    $schema = app(Generator::class)();
    $resource = $schema['components']['schemas']['EventResource'];
    expect($resource['properties']['chat_id']['type'])->toBe(['string', 'null'])
        ->and($resource['required'])->toContain('chat_id');
    $responses = $schema['paths']['/events/{event}/chat']['post']['responses'];
    foreach ([200, 201] as $status) {
        expect($responses[$status]['content']['application/json']['schema']['properties']['data']['$ref'])->toBe('#/components/schemas/ChatResource');
    }
});
