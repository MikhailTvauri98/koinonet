<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Chat\ChatAccess;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('scopes ministry moderation to its ministry and prohibits moderator editing', function () {
    $ministry = ministryWithRoles();
    $other = ministryWithRoles('Другое');
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $otherChat = Chat::query()->where('ministry_id', $other->id)->sole();
    $actor = actingAsUser();
    $role = Role::query()->create(['scope' => 'ministry', 'ministry_id' => $ministry->id, 'name' => 'Проверка']);
    $role->permissions()->create(['permission' => Permission::ChatModerate->value]);
    memberOf($ministry, $actor->person, [$role->id]);
    $message = Message::factory()->for($chat)->create();
    $foreign = Message::factory()->for($otherChat)->create();
    $this->patchJson("/api/v1/messages/{$message->id}", ['body' => 'x'])->assertForbidden();
    $this->deleteJson("/api/v1/messages/{$foreign->id}")->assertForbidden();
    $this->deleteJson("/api/v1/messages/{$message->id}")->assertNoContent();
    expect(AuditEntry::query()->where('action', 'message.deleted_by_moderator')->sole()->actor_user_id)->toBe($actor->id);
});

it('allows global moderation in groups but never others direct messages', function () {
    [$a, $b] = User::factory()->count(2)->create();
    $group = Chat::factory()->withMembers($a, $b)->create();
    $direct = Chat::factory()->direct($a, $b)->create();
    $inGroup = Message::factory()->for($group)->from($a)->create();
    $inDirect = Message::factory()->for($direct)->from($a)->create();
    $moderator = actingAsUserWith([Permission::ChatsModerateAll]);
    $this->deleteJson("/api/v1/messages/{$inGroup->id}")->assertNoContent();
    $this->deleteJson("/api/v1/messages/{$inDirect->id}")->assertForbidden();
    expect(app(ChatAccess::class)->canManageMembers($moderator, $group))->toBeTrue();
    $group->update(['archived_at' => now()]);
    expect(app(ChatAccess::class)->canModerate($moderator, $group))->toBeFalse()
        ->and(app(ChatAccess::class)->canManageMembers($moderator, $group))->toBeFalse();
});

it('lets a group owner delete while plain members cannot', function () {
    $owner = actingAsUser();
    $member = User::factory()->create();
    $chat = Chat::factory()->withMembers($member)->create(['created_by_user_id' => $owner->id]);
    $message = Message::factory()->for($chat)->create();
    $this->actingAs($member)->deleteJson("/api/v1/messages/{$message->id}")->assertForbidden();
    $this->actingAs($owner)->deleteJson("/api/v1/messages/{$message->id}")->assertNoContent();
});

it('reports moderation without granting read or write to global moderators', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $actor = actingAsUserWith([Permission::ChatsModerateAll, Permission::MinistriesViewAll]);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.can_moderate', true)->assertJsonPath('data.can_write', false);
    $chat->update(['archived_at' => now()]);
    expect(app(ChatAccess::class)->canModerate($actor, $chat))->toBeFalse();
});

it('allows event managers to delete in their event chat', function () {
    $event = Event::factory()->create();
    $eventChat = Chat::factory()->event($event)->create();
    $manager = actingAsUserWith([Permission::CalendarChurchManage]);
    $message = Message::factory()->for($eventChat)->create();
    $this->deleteJson("/api/v1/messages/{$message->id}")->assertNoContent();
});

it('allows global moderators across nondirect kinds and rejects disabled actors', function () {
    $event = Event::factory()->create();
    $eventChat = Chat::factory()->event($event)->create();
    $global = actingAsUserWith([Permission::ChatsModerateAll]);
    $ministry = ministryWithRoles();
    $ministryChat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    foreach ([$ministryChat, $eventChat] as $chat) {
        $message = Message::factory()->for($chat)->create();
        $this->patchJson("/api/v1/messages/{$message->id}", ['body' => 'x'])->assertForbidden();
        $this->deleteJson("/api/v1/messages/{$message->id}")->assertNoContent();
    }
    $global->update(['disabled_at' => now()]);
    expect(app(ChatAccess::class)->canModerate($global, $eventChat))->toBeFalse();
});
