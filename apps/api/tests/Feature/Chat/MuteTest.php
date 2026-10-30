<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Chat\Actions\MuteChat;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use Carbon\CarbonImmutable;
use Dedoc\Scramble\Generator;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('denies disabled members before validating mute input', function () {
    $me = actingAsUser(attributes: ['disabled_at' => now()]);
    $chat = Chat::factory()->withMembers($me)->create();
    $this->postJson("/api/v1/chats/{$chat->id}/mute", ['until' => 'bad'])->assertForbidden();
    $this->deleteJson("/api/v1/chats/{$chat->id}/mute")->assertForbidden();
});

it('documents optional nonnullable mute time and full response types', function () {
    $schema = app(Generator::class)();
    $operation = $schema['paths']['/chats/{chat}/mute']['post'];
    $input = $operation['requestBody']['content']['application/json']['schema'];
    if (isset($input['$ref'])) {
        $input = $schema['components']['schemas'][basename($input['$ref'])];
    }
    expect($input['properties']['until']['type'])->toBe('string')
        ->and($input['properties']['until']['format'])->toBe('date-time')
        ->and($input['required'] ?? [])->not->toContain('until');
    $properties = $schema['components']['schemas']['ChatResource']['properties'];
    expect($properties['unread_count']['type'])->toBe('integer')
        ->and($properties['title']['type'])->toBe('string')
        ->and($properties['muted_until']['type'])->toBe(['string', 'null'])
        ->and($properties['muted_until']['format'])->toBe('date-time')
        ->and($properties['can_write']['type'])->toBe('boolean')
        ->and($properties['members']['items']['$ref'])->toBe('#/components/schemas/ChatMemberResource');
    expect($operation['responses'][200]['content']['application/json']['schema']['properties']['data']['$ref'])->toBe('#/components/schemas/ChatResource');
    expect($schema['paths']['/chats/{chat}/mute']['delete']['responses'][200]['content']['application/json']['schema']['properties']['data']['$ref'])->toBe('#/components/schemas/ChatResource');
});

it('changes only the personal mute setting and returns a complete current card', function () {
    $me = actingAsUser();
    $chat = Chat::factory()->archived()->withMembers($me)->create();
    $message = Message::factory()->for($chat)->create();
    $chat->update(['last_message_id' => $message->id]);
    $before = $chat->members()->where('user_id', $me->id)->sole()->getAttributes();
    $this->postJson("/api/v1/chats/{$chat->id}/mute")->assertOk()
        ->assertJsonPath('data.muted_until', '9999-12-31T00:00:00.000000Z')
        ->assertJsonPath('data.unread_count', 1)->assertJsonPath('data.can_write', false)
        ->assertJsonCount($chat->members()->count(), 'data.members')->assertJsonCount(0, 'data.pinned_messages');
    $this->postJson("/api/v1/chats/{$chat->id}/mute", ['until' => '2090-01-02T15:00:00+03:00'])->assertOk()
        ->assertJsonPath('data.muted_until', '2090-01-02T12:00:00.000000Z');
    $this->deleteJson("/api/v1/chats/{$chat->id}/mute")->assertOk()->assertJsonPath('data.muted_until', null);
    expect($chat->members()->where('user_id', $me->id)->sole()->getAttributes())->toBe($before)
        ->and($chat->messages()->count())->toBe(1);
});

it('rejects malformed null and past mute times', function (mixed $until) {
    $me = actingAsUser();
    $chat = Chat::factory()->withMembers($me)->create();
    $this->postJson("/api/v1/chats/{$chat->id}/mute", ['until' => $until])->assertUnprocessable()->assertJsonValidationErrors('until');
})->with([null, 'bad', '2020-01-01T00:00:00Z', '2090-01-01', 12]);

it('denies nonmembers even with global reading or moderation rights', function () {
    actingAsUserWith([Permission::MinistriesViewAll, Permission::ChatsModerateAll]);
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $this->postJson("/api/v1/chats/{$chat->id}/mute")->assertForbidden();
    $this->deleteJson("/api/v1/chats/{$chat->id}/mute")->assertForbidden();
});

it('freshly rejects removed membership and disabled actors in the action', function (bool $disabled) {
    $me = actingAsUser();
    $chat = Chat::factory()->withMembers($me)->create();
    $chat->load('members');
    if ($disabled) {
        $me->newQuery()->whereKey($me->id)->update(['disabled_at' => now()]);
    } else {
        $chat->members()->where('user_id', $me->id)->delete();
    }
    app(MuteChat::class)->handle($me, $chat, CarbonImmutable::now()->addDay());
})->with([true, false])->throws(AuthorizationException::class);
