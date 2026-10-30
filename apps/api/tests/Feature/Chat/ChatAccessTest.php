<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\Models\Chat;
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
    require base_path('routes/channels.php');
});

it('opens ministry chats to members and read only to view all readers', function () {
    $ministry = ministryWithRoles();
    $member = actingAsUser();
    memberOf($ministry, $member->person);
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()
        ->assertJsonPath('data.title', 'Прославление')->assertJsonPath('data.can_write', true)
        ->assertJsonPath('data.can_moderate', false)->assertJsonPath('data.can_manage_members', false);
    app('auth')->forgetGuards();
    actingAsUserWith([Permission::MinistriesViewAll]);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.can_write', false)
        ->assertJsonPath('data.unread_count', 0)->assertJsonPath('data.muted_until', null)->assertJsonPath('data.is_owner', false);
    expect($chat->members()->count())->toBe(1);
    app('auth')->forgetGuards();
    actingAsUser();
    $this->getJson("/api/v1/chats/{$chat->id}")->assertForbidden();
});

it('allows archived history but never writing', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->archived()->create();
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.archived', true)->assertJsonPath('data.can_write', false);
});

it('offers no mutation capabilities to an archived group owner', function () {
    $owner = actingAsUser();
    $chat = Chat::factory()->archived()->create(['created_by_user_id' => $owner->id]);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.is_owner', true)
        ->assertJsonPath('data.can_write', false)->assertJsonPath('data.can_moderate', false)->assertJsonPath('data.can_manage_members', false);
});

it('allows only the group owner to manage members and moderate groups', function () {
    $owner = actingAsUser();
    $member = User::factory()->create();
    $chat = Chat::factory()->withMembers($member)->create(['created_by_user_id' => $owner->id]);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.is_owner', true)
        ->assertJsonPath('data.can_manage_members', true)->assertJsonPath('data.can_moderate', true);
    app('auth')->forgetGuards();
    $this->actingAs($member);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.can_manage_members', false)->assertJsonPath('data.can_moderate', false);
});

it('delegates event moderation to event managers and never moderates direct chats', function () {
    $manager = actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    $chat = Chat::factory()->event($event)->withMembers($manager)->create();
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.title', $event->title)
        ->assertJsonPath('data.can_moderate', true)->assertJsonPath('data.can_manage_members', false);
    $other = User::factory()->create();
    $direct = Chat::factory()->direct($manager, $other)->create();
    $this->getJson("/api/v1/chats/{$direct->id}")->assertOk()->assertJsonPath('data.can_moderate', false)->assertJsonPath('data.can_manage_members', false);
});

it('authorizes the channel with the same membership and view all rules', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $member = actingAsUser();
    memberOf($ministry, $member->person);
    $payload = ['channel_name' => "private-chat.{$chat->id}", 'socket_id' => '1.1'];
    $this->postJson('/broadcasting/auth', $payload)->assertOk();
    actingAsUserWith([Permission::MinistriesViewAll]);
    $this->postJson('/broadcasting/auth', $payload)->assertOk();
    actingAsUser();
    $this->postJson('/broadcasting/auth', $payload)->assertForbidden();
    $payload['channel_name'] = 'private-chat.'.str()->ulid();
    $this->postJson('/broadcasting/auth', $payload)->assertForbidden();
});

it('denies disabled accounts in every access predicate and channel', function () {
    $user = actingAsUser(attributes: ['disabled_at' => now()]);
    $chat = Chat::factory()->create(['created_by_user_id' => $user->id]);
    $access = app(ChatAccess::class);
    expect($access->canRead($user, $chat))->toBeFalse()->and($access->canWrite($user, $chat))->toBeFalse()
        ->and($access->canModerate($user, $chat))->toBeFalse()->and($access->canManageMembers($user, $chat))->toBeFalse();
    $this->getJson("/api/v1/chats/{$chat->id}")->assertForbidden();
    $this->getJson('/api/v1/chats')->assertForbidden();
    $this->postJson('/broadcasting/auth', ['channel_name' => "private-chat.{$chat->id}", 'socket_id' => '1.1'])->assertForbidden();
});

it('requires an account to read chats', function () {
    $this->getJson('/api/v1/chats')->assertUnauthorized();
    $this->getJson('/api/v1/chats/'.str()->ulid())->assertUnauthorized();
});
