<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Chat\UnreadCounter;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use Carbon\CarbonImmutable;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;

uses(RefreshDatabase::class);

it('lists only membership chats in deterministic newest first order including null dates', function () {
    $user = actingAsUser();
    $other = User::factory()->create();
    $time = CarbonImmutable::parse('2026-10-30T12:00:00Z');
    $old = Chat::factory()->withMembers($user)->create(['last_message_at' => $time->subHour()]);
    $new = Chat::factory()->withMembers($user)->create(['last_message_at' => $time]);
    $emptyA = Chat::factory()->withMembers($user)->create();
    $emptyB = Chat::factory()->withMembers($user)->create();
    Chat::factory()->withMembers($other)->create();
    $ids = $this->getJson('/api/v1/chats')->assertOk()->json('data.*.id');
    expect($ids)->toBe([$new->id, $old->id, max($emptyA->id, $emptyB->id), min($emptyA->id, $emptyB->id)]);
});

it('hides empty direct chats but shows their last message preview once sent', function () {
    $user = actingAsUser();
    $other = User::factory()->create();
    $chat = Chat::factory()->direct($user, $other)->create();
    $this->getJson('/api/v1/chats')->assertOk()->assertJsonCount(0, 'data');
    $message = Message::factory()->for($chat)->from($other)->create(['body' => 'Привет']);
    $chat->update(['last_message_id' => $message->id, 'last_message_at' => $message->created_at]);
    $this->getJson('/api/v1/chats')->assertOk()->assertJsonPath('data.0.last_message.body_preview', 'Привет')->assertJsonPath('data.0.unread_count', 1);
    $message->update(['deleted_at' => now(), 'body' => null]);
    $this->getJson('/api/v1/chats')->assertJsonPath('data.0.last_message.body_preview', 'Сообщение удалено')->assertJsonPath('data.0.unread_count', 0);
});

it('does not list ministry chats accessible only through view all', function () {
    ministryWithRoles();
    actingAsUserWith([Permission::MinistriesViewAll]);
    $this->getJson('/api/v1/chats')->assertOk()->assertJsonCount(0, 'data');
});

it('protects person names and photos in chat members and direct titles', function (bool $allowed) {
    $user = $allowed ? actingAsUserWith([Permission::PeopleView]) : actingAsUser();
    $other = User::factory()->create();
    $photo = Media::factory()->create(['variants' => ['thumb' => 'thumb.jpg']]);
    $other->person->update(['last_name' => 'Иванова', 'first_name' => 'Мария', 'patronymic' => null, 'note' => 'Секрет', 'email' => 'secret@example.com', 'photo_media_id' => $photo->id]);
    $chat = Chat::factory()->direct($user, $other)->create();
    $message = Message::factory()->for($chat)->from($other)->create();
    $chat->update(['last_message_id' => $message->id, 'last_message_at' => $message->created_at]);
    $title = $allowed ? 'Иванова Мария' : 'Личный чат';
    $list = $this->getJson('/api/v1/chats')->assertJsonPath('data.0.title', $title);
    expect($list->json('data.0.avatar_url') !== null)->toBe($allowed);
    $response = $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.title', $title);
    $member = collect($response->json('data.members'))->firstWhere('user_id', $other->id);
    expect($member['full_name'])->toBe($allowed ? 'Иванова Мария' : null)->and($member['photo_url'] !== null)->toBe($allowed);
    expect($response->getContent())->not->toContain('Секрет', 'secret@example.com', '"note"', '"email"', '"phone"');
})->with([true, false]);

it('counts unread by microsecond timestamp then id excluding own and deleted but including erased senders', function () {
    $user = actingAsUser();
    $other = User::factory()->create();
    $chat = Chat::factory()->withMembers($user, $other)->create();
    $at = CarbonImmutable::parse('2026-10-30T12:00:00.123456Z');
    $cursor = Message::factory()->for($chat)->from($other)->at($at)->create(['id' => '01k00000000000000000000002']);
    Message::factory()->for($chat)->from($other)->at($at)->create(['id' => '01k00000000000000000000001']);
    Message::factory()->for($chat)->from($other)->at($at)->create(['id' => '01k00000000000000000000003']);
    Message::factory()->for($chat)->from($other)->at($at->subMicrosecond())->create();
    Message::factory()->for($chat)->at($at->addMicrosecond())->create(['sender_user_id' => null]);
    Message::factory()->for($chat)->from($user)->at($at->addSecond())->create();
    Message::factory()->for($chat)->from($other)->at($at->addSecond())->deleted()->create();
    $chat->members()->where('user_id', $user->id)->update(['last_read_message_id' => $cursor->id]);
    $counter = app(UnreadCounter::class);
    expect($counter->forChat($user, $chat))->toBe(2)->and($counter->total($user))->toBe(2);
    $this->getJson("/api/v1/chats/{$chat->id}")->assertOk()->assertJsonPath('data.unread_count', 2);
});

it('batches all unread counts in one query and counts no participation for nonmembers', function () {
    $user = actingAsUserWith([Permission::MinistriesViewAll]);
    $first = Chat::factory()->withMembers($user)->create();
    $second = Chat::factory()->withMembers($user)->create();
    $ministry = ministryWithRoles();
    $readOnly = Chat::query()->where('ministry_id', $ministry->id)->sole();
    foreach ([$first, $second, $readOnly] as $chat) {
        Message::factory()->for($chat)->create(['sender_user_id' => null]);
    }
    $chats = Chat::query()->whereIn('id', [$first->id, $second->id, $readOnly->id])->get();
    DB::enableQueryLog();
    DB::flushQueryLog();
    $counts = app(UnreadCounter::class)->forChats($user, $chats);
    $queries = DB::getQueryLog();
    DB::disableQueryLog();
    expect($counts)->toBe([$first->id => 1, $second->id => 1, $readOnly->id => 0])->and($queries)->toHaveCount(1);
    expect(app(UnreadCounter::class)->forChat($user, $readOnly))->toBe(0)->and(app(UnreadCounter::class)->total($user))->toBe(2);
});

it('documents concrete chat read schemas without unknown properties', function () {
    $schema = app(Generator::class)();
    foreach (['ChatResource', 'ChatListItemResource', 'ChatMemberResource'] as $name) {
        expect($schema['components']['schemas'])->toHaveKey($name);
        foreach ($schema['components']['schemas'][$name]['properties'] as $property) {
            expect(isset($property['type']) || isset($property['$ref']) || isset($property['anyOf']) || isset($property['allOf']))->toBeTrue();
        }
    }
    foreach (['ChatResource', 'ChatListItemResource'] as $name) {
        $properties = $schema['components']['schemas'][$name]['properties'];
        expect($properties['unread_count']['type'])->toBe('integer')
            ->and($properties['is_owner']['type'])->toBe('boolean')
            ->and($properties['last_message']['properties']['created_at']['type'])->toBe('string');
    }
    foreach (['can_write', 'can_moderate', 'can_manage_members'] as $capability) {
        expect($schema['components']['schemas']['ChatResource']['properties'][$capability]['type'])->toBe('boolean');
    }
    expect($schema['components']['schemas']['ChatResource']['properties']['members']['items']['$ref'])->toBe('#/components/schemas/ChatMemberResource');
});
