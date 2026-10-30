<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Permission;
use App\Modules\Chat\Actions\UpdateGroupChat;
use App\Modules\Chat\Broadcasts\ChatMembersChangedBroadcast;
use App\Modules\Chat\Broadcasts\ChatUpdatedBroadcast;
use App\Modules\Chat\Broadcasts\UnreadTotalBroadcast;
use App\Modules\Chat\Events\ChatMembersChanged;
use App\Modules\Chat\Events\ChatMetadataChanged;
use App\Modules\Chat\Listeners\BroadcastChatChanges;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\MediaStatus;
use App\Modules\Media\Models\Media;
use App\Support\DomainRuleException;
use Dedoc\Scramble\Generator;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event as EventBus;

uses(RefreshDatabase::class);

it('denies creating a group without chats.create_groups', function () {
    actingAsUser();

    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Поездка', 'member_ids' => [User::factory()->create()->id]])->assertForbidden();
});

it('creates a group with the creator as owner and the listed members', function () {
    EventBus::fake([ChatMembersChanged::class]);
    $me = actingAsUserWith([Permission::ChatsCreateGroups]);
    [$a, $b] = User::factory()->count(2)->create();

    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Поездка', 'member_ids' => [$a->id, $b->id]])
        ->assertCreated()
        ->assertJsonPath('data.type', 'group')
        ->assertJsonPath('data.title', 'Поездка')
        ->assertJsonPath('data.is_owner', true)
        ->assertJsonPath('data.can_manage_members', true)
        ->assertJsonCount(3, 'data.members');

    expect(ChatMember::query()->where('is_owner', true)->sole()->user_id)->toBe($me->id);
});

it('requires at least one other member and rejects disabled accounts', function () {
    actingAsUserWith([Permission::ChatsCreateGroups]);
    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Пусто', 'member_ids' => []])->assertStatus(422)->assertJsonValidationErrors('member_ids');

    $disabled = User::factory()->create(['disabled_at' => now()]);
    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Х', 'member_ids' => [$disabled->id]])->assertStatus(422)->assertJsonPath('code', 'chat.member_disabled');
});

it('lets the owner rename, set an avatar, add and remove members', function () {
    $me = actingAsUserWith([Permission::ChatsCreateGroups]);
    $a = User::factory()->create();
    $b = User::factory()->create();
    $chat = $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Поездка', 'member_ids' => [$a->id]])->json('data.id');
    $media = Media::factory()->create(['uploader_user_id' => $me->id, 'variants' => ['thumb' => 'test-thumb.jpg']]);

    $this->patchJson("/api/v1/chats/{$chat}", ['title' => 'Поездка в горы'])->assertOk()->assertJsonPath('data.title', 'Поездка в горы');
    $this->putJson("/api/v1/chats/{$chat}/avatar", ['media_id' => $media->id])->assertOk()->assertJsonPath('data.avatar_url', fn ($v) => $v !== null);
    $this->postJson("/api/v1/chats/{$chat}/members", ['user_ids' => [$b->id]])->assertOk()->assertJsonCount(3, 'data.members');
    $this->deleteJson("/api/v1/chats/{$chat}/members/{$a->id}")->assertOk()->assertJsonCount(2, 'data.members');
});

it('does not let a plain member manage the group', function () {
    $owner = User::factory()->create();
    $me = actingAsUser();
    $chat = Chat::factory()->withMembers($owner, $me)->create(['created_by_user_id' => $owner->id]);
    $chat->members()->where('user_id', $owner->id)->update(['is_owner' => true]);

    $this->patchJson("/api/v1/chats/{$chat->id}", ['title' => 'Х'])->assertForbidden();
    $this->postJson("/api/v1/chats/{$chat->id}/members", ['user_ids' => [User::factory()->create()->id]])->assertForbidden();
    $this->postJson("/api/v1/chats/{$chat->id}/archive")->assertForbidden();
});

it('lets a member leave but not the owner', function () {
    $owner = User::factory()->create();
    $me = actingAsUser();
    $chat = Chat::factory()->withMembers($owner, $me)->create(['created_by_user_id' => $owner->id]);
    $chat->members()->where('user_id', $owner->id)->update(['is_owner' => true]);

    $this->postJson("/api/v1/chats/{$chat->id}/leave")->assertNoContent();
    expect(ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $me->id)->exists())->toBeFalse();

    app('auth')->forgetGuards();
    $this->actingAs($owner)->postJson("/api/v1/chats/{$chat->id}/leave")->assertStatus(422)->assertJsonPath('code', 'chat.owner_cannot_leave');
});

it('refuses to edit the members of a ministry chat by hand', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    actingAsUserWith([Permission::ChatsModerateAll]);

    $this->postJson("/api/v1/chats/{$chat->id}/members", ['user_ids' => [User::factory()->create()->id]])
        ->assertStatus(422)->assertJsonPath('code', 'chat.members_managed_by_sync');
    $this->postJson("/api/v1/chats/{$chat->id}/leave")->assertStatus(422)->assertJsonPath('code', 'chat.not_group');
});

it('archives a group with a journal entry and makes it read-only', function () {
    $me = actingAsUserWith([Permission::ChatsCreateGroups]);
    $chat = $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Поездка', 'member_ids' => [User::factory()->create()->id]])->json('data.id');

    $this->postJson("/api/v1/chats/{$chat}/archive")->assertOk()->assertJsonPath('data.archived', true);

    expect(AuditEntry::query()->where('action', 'chat.archived')->where('subject_id', $chat)->exists())->toBeTrue();
    $this->postJson("/api/v1/chats/{$chat}/messages", ['body' => 'Эй'])->assertStatus(422)->assertJsonPath('code', 'chat.archived');
});

it('lets chats.moderate_all manage and archive someone elses group', function () {
    [$owner, $member] = User::factory()->count(2)->create();
    $chat = Chat::factory()->withMembers($owner, $member)->create(['created_by_user_id' => $owner->id]);
    $chat->members()->where('user_id', $owner->id)->update(['is_owner' => true]);
    actingAsUserWith([Permission::ChatsModerateAll]);

    $this->deleteJson("/api/v1/chats/{$chat->id}/members/{$member->id}")->assertOk();
    $this->postJson("/api/v1/chats/{$chat->id}/archive")->assertOk();
});

it('deduplicates members and requires another active account', function () {
    $me = actingAsUserWith([Permission::ChatsCreateGroups]);
    $a = User::factory()->create();
    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Группа', 'member_ids' => [$me->id, $me->id]])->assertUnprocessable()->assertJsonValidationErrors('member_ids');
    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Группа', 'member_ids' => [$me->id, $a->id, $a->id]])->assertCreated()->assertJsonCount(2, 'data.members');
});

it('validates all additions atomically and emits no false membership events', function () {
    EventBus::fake([ChatMembersChanged::class]);
    $me = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $me->id]);
    $a = User::factory()->create();
    $disabled = User::factory()->create(['disabled_at' => now()]);
    $this->postJson("/api/v1/chats/{$chat->id}/members", ['user_ids' => [$a->id, $disabled->id]])->assertUnprocessable()->assertJsonPath('code', 'chat.member_disabled');
    expect($chat->members()->count())->toBe(1);
    $this->postJson("/api/v1/chats/{$chat->id}/members", ['user_ids' => [$me->id, $me->id]])->assertOk();
    $this->deleteJson("/api/v1/chats/{$chat->id}/members/{$a->id}")->assertOk();
    EventBus::assertNotDispatched(ChatMembersChanged::class);
});

it('never lets a moderator remove the owner or read secret message content through management responses', function () {
    $owner = User::factory()->create();
    $chat = Chat::factory()->create(['created_by_user_id' => $owner->id]);
    $secret = Message::factory()->for($chat)->create(['body' => 'SECRET GROUP CONTENT']);
    $chat->update(['last_message_id' => $secret->id, 'last_message_at' => $secret->created_at]);
    $chat->pins()->create(['message_id' => $secret->id, 'pinned_by_user_id' => $owner->id, 'pinned_at' => now()]);
    actingAsUserWith([Permission::ChatsModerateAll]);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertForbidden();
    $this->deleteJson("/api/v1/chats/{$chat->id}/members/{$owner->id}")->assertUnprocessable()->assertJsonPath('code', 'chat.owner_cannot_leave');
    $this->patchJson("/api/v1/chats/{$chat->id}", ['title' => 'Новое'])->assertOk()->assertJsonPath('data.last_message', null)->assertJsonCount(0, 'data.pinned_messages')->assertDontSee('SECRET GROUP CONTENT');
});

it('rejects every group mutation after archival', function () {
    $owner = actingAsUser();
    $chat = Chat::factory()->archived()->create(['created_by_user_id' => $owner->id]);
    $this->patchJson("/api/v1/chats/{$chat->id}", ['title' => 'Новое'])->assertUnprocessable()->assertJsonPath('code', 'chat.archived');
    $this->postJson("/api/v1/chats/{$chat->id}/members", ['user_ids' => [User::factory()->create()->id]])->assertUnprocessable()->assertJsonPath('code', 'chat.archived');
    $this->postJson("/api/v1/chats/{$chat->id}/leave")->assertUnprocessable()->assertJsonPath('code', 'chat.archived');
});

it('validates avatar ownership and readiness without changing the reference', function () {
    $me = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $me->id]);
    $foreign = Media::factory()->create();
    $processing = Media::factory()->create(['uploader_user_id' => $me->id, 'status' => MediaStatus::Processing]);
    $this->putJson("/api/v1/chats/{$chat->id}/avatar", ['media_id' => $foreign->id])->assertUnprocessable()->assertJsonPath('code', 'media.not_owned');
    $this->putJson("/api/v1/chats/{$chat->id}/avatar", ['media_id' => $processing->id])->assertUnprocessable()->assertJsonPath('code', 'media.not_ready');
    expect($chat->fresh()->avatar_media_id)->toBeNull();
});

it('rolls back metadata writes and defers events until commit', function () {
    EventBus::fake([ChatMetadataChanged::class]);
    $me = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $me->id, 'title' => 'Прежнее']);
    DB::beginTransaction();
    app(UpdateGroupChat::class)->handle($me, $chat, 'Новое');
    EventBus::assertNotDispatched(ChatMetadataChanged::class);
    DB::rollBack();
    expect($chat->fresh()->title)->toBe('Прежнее');
    app(UpdateGroupChat::class)->handle($me, $chat, 'Новое');
    EventBus::assertDispatchedTimes(ChatMetadataChanged::class, 1);
});

it('refreshes existing members through personal metadata broadcasts only', function () {
    EventBus::fake([ChatUpdatedBroadcast::class, UnreadTotalBroadcast::class, ChatMembersChangedBroadcast::class]);
    $me = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $me->id]);
    app(BroadcastChatChanges::class)->handle(new ChatMetadataChanged($chat->id));
    EventBus::assertDispatched(ChatUpdatedBroadcast::class, fn ($event) => $event->broadcastWith()['chat']['title'] === $chat->title);
    EventBus::assertNotDispatched(ChatMembersChangedBroadcast::class);
});

it('rechecks stale actor chat and membership objects in group actions', function () {
    $me = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $me->id]);
    $chat->load('members');
    $chat->members()->where('user_id', $me->id)->update(['is_owner' => false]);
    expect(fn () => app(UpdateGroupChat::class)->handle($me, $chat, 'Нет'))->toThrow(AuthorizationException::class);
    $chat->members()->where('user_id', $me->id)->update(['is_owner' => true]);
    User::query()->whereKey($me->id)->update(['disabled_at' => now()]);
    expect(fn () => app(UpdateGroupChat::class)->handle($me, $chat, 'Нет'))->toThrow(AuthorizationException::class);
    User::query()->whereKey($me->id)->update(['disabled_at' => null]);
    Chat::query()->whereKey($chat->id)->update(['archived_at' => now()]);
    expect(fn () => app(UpdateGroupChat::class)->handle($me, $chat, 'Нет'))->toThrow(DomainRuleException::class);
    expect($chat->fresh()->title)->not->toBe('Нет');
});

it('preserves real unread counts in every management response', function () {
    $me = actingAsUser();
    $chat = Chat::factory()->create(['created_by_user_id' => $me->id]);
    Message::factory()->for($chat)->create();
    $other = User::factory()->create();
    $media = Media::factory()->create(['uploader_user_id' => $me->id]);
    $this->patchJson("/api/v1/chats/{$chat->id}", ['title' => 'Новое'])->assertOk()->assertJsonPath('data.unread_count', 1);
    $this->postJson("/api/v1/chats/{$chat->id}/members", ['user_ids' => [$other->id]])->assertOk()->assertJsonPath('data.unread_count', 1);
    $this->deleteJson("/api/v1/chats/{$chat->id}/members/{$other->id}")->assertOk()->assertJsonPath('data.unread_count', 1);
    $this->putJson("/api/v1/chats/{$chat->id}/avatar", ['media_id' => $media->id])->assertOk()->assertJsonPath('data.unread_count', 1);
    $this->postJson("/api/v1/chats/{$chat->id}/archive")->assertOk()->assertJsonPath('data.unread_count', 1);
});

it('documents exact group endpoint responses and recursive resource scalar types', function () {
    $schema = app(Generator::class)();
    foreach ([['/chats', 'post', 201], ['/chats/{chat}', 'patch', 200], ['/chats/{chat}/avatar', 'put', 200], ['/chats/{chat}/members', 'post', 200], ['/chats/{chat}/members/{userId}', 'delete', 200], ['/chats/{chat}/archive', 'post', 200]] as [$path,$method,$status]) {
        expect($schema['paths'][$path][$method]['responses'][$status]['content']['application/json']['schema']['properties']['data']['$ref'])->toBe('#/components/schemas/ChatResource');
    }
    expect($schema['paths']['/chats/{chat}/leave']['post']['responses'])->toHaveKey(204);
    $properties = $schema['components']['schemas']['ChatResource']['properties'];
    foreach (['archived', 'is_owner', 'can_write', 'can_moderate', 'can_manage_members'] as $key) {
        expect($properties[$key]['type'])->toBe('boolean');
    }
    expect($properties['unread_count']['type'])->toBe('integer')
        ->and($properties['members']['items']['$ref'])->toBe('#/components/schemas/ChatMemberResource')
        ->and($properties['pinned_messages']['items']['$ref'])->toBe('#/components/schemas/MessageResource');
    $message = $schema['components']['schemas']['MessageResource']['properties'];
    expect($message['deleted']['type'])->toBe('boolean')->and($message['reply_to']['properties']['deleted']['type'])->toBe('boolean')->and($message['body']['type'])->toBe(['string', 'null']);
});
