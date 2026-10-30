<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Chat\Actions\OpenDirectChat;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Dedoc\Scramble\Generator;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('denies opening a direct chat without chats.dm', function () {
    actingAsUser();
    $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => User::factory()->create()->id])->assertForbidden();
});

it('returns the same pair from either side without resetting member settings', function () {
    $me = actingAsUserWith([Permission::ChatsDm, Permission::PeopleView]);
    $other = User::factory()->create();
    $other->person->update(['last_name' => 'Петрова', 'first_name' => 'Анна', 'patronymic' => null]);
    $other->person->globalRoles()->attach(Role::factory()->global()->withPermissions([Permission::ChatsDm])->create());
    $id = $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $other->id])->assertCreated()->assertJsonPath('data.title', 'Петрова Анна')->json('data.id');
    $chat = Chat::query()->findOrFail($id);
    $read = Message::factory()->for($chat)->create(['sender_user_id' => $other->id, 'created_at' => now()->subMinute()]);
    Message::factory()->for($chat)->create(['sender_user_id' => $other->id]);
    $member = $chat->members()->where('user_id', $me->id)->sole();
    $member->update(['muted_until' => now()->addDay(), 'last_read_message_id' => $read->id]);
    $before = $member->fresh()->getAttributes();
    $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $other->id])->assertOk()->assertJsonPath('data.id', $id)->assertJsonPath('data.unread_count', 1);
    app('auth')->forgetGuards();
    $this->actingAs($other)->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $me->id])->assertOk()->assertJsonPath('data.id', $id);
    expect(Chat::query()->count())->toBe(1)->and($member->fresh()->getAttributes())->toBe($before);
});

it('allows replies by membership without chats.dm and hides empty chats from both lists', function () {
    $me = actingAsUserWith([Permission::ChatsDm]);
    $other = User::factory()->create();
    $id = $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $other->id])->assertCreated()->json('data.id');
    $this->getJson('/api/v1/chats')->assertJsonCount(0, 'data');
    app('auth')->forgetGuards();
    $this->actingAs($other)->getJson('/api/v1/chats')->assertJsonCount(0, 'data');
    $this->postJson("/api/v1/chats/{$id}/messages", ['body' => 'Отвечаю'])->assertCreated();
    $this->getJson('/api/v1/chats')->assertJsonCount(1, 'data');
    app('auth')->forgetGuards();
    $this->actingAs($me)->getJson('/api/v1/chats')->assertJsonCount(1, 'data')->assertJsonPath('data.0.unread_count', 1);
    app('auth')->forgetGuards();
    actingAsUserWith([Permission::ChatsDm]);
    $this->postJson("/api/v1/chats/{$id}/messages", ['body' => 'Чужой'])->assertForbidden();
});

it('refuses self disabled and invalid targets', function () {
    $me = actingAsUserWith([Permission::ChatsDm]);
    $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $me->id])->assertUnprocessable()->assertJsonPath('code', 'chat.direct_self');
    $disabled = User::factory()->create(['disabled_at' => now()]);
    $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $disabled->id])->assertUnprocessable()->assertJsonPath('code', 'chat.direct_user_disabled');
    foreach ([[], ['user_id' => 'invalid'], ['user_id' => (string) str()->ulid()]] as $input) {
        $this->postJson('/api/v1/chats', ['type' => 'direct', ...$input])->assertUnprocessable()->assertJsonValidationErrors('user_id');
    }
    expect(Chat::query()->count())->toBe(0);
});

it('rechecks stale actor and target before returning an existing direct chat', function () {
    $me = actingAsUserWith([Permission::ChatsDm]);
    $other = User::factory()->create();
    app(OpenDirectChat::class)->handle($me, $other);
    User::query()->whereKey($other->id)->update(['disabled_at' => now()]);
    expect(fn () => app(OpenDirectChat::class)->handle($me, $other))->toThrow(DomainRuleException::class);
    User::query()->whereKey($other->id)->update(['disabled_at' => null]);
    User::query()->whereKey($me->id)->update(['disabled_at' => now()]);
    expect(fn () => app(OpenDirectChat::class)->handle($me, $other))->toThrow(AuthorizationException::class);
    expect(Chat::query()->count())->toBe(1);
});

it('rolls back the chat and both participants atomically', function () {
    $me = actingAsUserWith([Permission::ChatsDm]);
    $other = User::factory()->create();
    DB::beginTransaction();
    app(OpenDirectChat::class)->handle($me, $other);
    DB::rollBack();
    expect(Chat::query()->count())->toBe(0)->and(DB::table('chat_members')->count())->toBe(0);
});

it('keeps direct chats outside group management and moderation', function () {
    actingAsUserWith([Permission::ChatsDm, Permission::ChatsModerateAll]);
    $id = $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => User::factory()->create()->id])->assertCreated()->json('data.id');
    $this->patchJson("/api/v1/chats/{$id}", ['title' => 'Группа'])->assertUnprocessable()->assertJsonPath('code', 'chat.not_group');
    $this->postJson("/api/v1/chats/{$id}/archive")->assertUnprocessable()->assertJsonPath('code', 'chat.not_group');
    $this->postJson("/api/v1/chats/{$id}/members", ['user_ids' => [User::factory()->create()->id]])->assertUnprocessable()->assertJsonPath('code', 'chat.not_group');
    $this->getJson("/api/v1/chats/{$id}")->assertOk()->assertJsonPath('data.can_moderate', false)->assertJsonPath('data.can_manage_members', false);
});

it('does not let group creation permission open a direct chat', function () {
    actingAsUserWith([Permission::ChatsCreateGroups]);
    $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => User::factory()->create()->id])->assertForbidden();
    app('auth')->forgetGuards();
    actingAsUserWith([Permission::ChatsDm]);
    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Группа', 'member_ids' => [User::factory()->create()->id]])->assertForbidden();
});

it('documents both full direct chat response statuses', function () {
    $schema = app(Generator::class)();
    foreach ([200, 201] as $status) {
        expect($schema['paths']['/chats']['post']['responses'][$status]['content']['application/json']['schema']['properties']['data']['$ref'])->toBe('#/components/schemas/ChatResource');
    }
    $request = $schema['components']['schemas']['CreateChatRequest'];
    expect($request['required'])->toBe(['type'])
        ->and($request['oneOf'][0]['required'])->toBe(['title', 'member_ids'])
        ->and($request['oneOf'][1]['required'])->toBe(['user_id']);
});

it('ignores fields from the other request branch', function () {
    actingAsUserWith([Permission::ChatsDm, Permission::ChatsCreateGroups]);
    $other = User::factory()->create();
    $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => $other->id, 'title' => [], 'member_ids' => 'invalid'])
        ->assertCreated()->assertJsonPath('data.type', 'direct');
    $this->postJson('/api/v1/chats', ['type' => 'group', 'title' => 'Группа', 'member_ids' => [$other->id], 'user_id' => 'invalid'])
        ->assertCreated()->assertJsonPath('data.type', 'group');
});

it('opens a direct chat with two participants and no owner', function () {
    actingAsUserWith([Permission::ChatsDm]);
    $this->postJson('/api/v1/chats', ['type' => 'direct', 'user_id' => User::factory()->create()->id])
        ->assertCreated()->assertJsonPath('data.type', 'direct')->assertJsonPath('data.title', 'Личный чат')
        ->assertJsonPath('data.is_owner', false)->assertJsonPath('data.can_write', true)
        ->assertJsonPath('data.can_moderate', false)->assertJsonPath('data.can_manage_members', false)
        ->assertJsonCount(2, 'data.members');
    expect(Chat::query()->sole()->members()->where('is_owner', true)->exists())->toBeFalse();
});
