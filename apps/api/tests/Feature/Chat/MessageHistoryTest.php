<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Chat\MessageCursor;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use Carbon\CarbonImmutable;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

function chatWithHistory(User $user, int $count): Chat
{
    $chat = Chat::factory()->withMembers($user)->create();
    foreach (range(1, $count) as $i) {
        Message::factory()->for($chat)->from($user)->at(CarbonImmutable::parse('2026-12-01T10:00:00Z')->addSeconds($i))->create(['body' => "m{$i}"]);
    }

    return $chat;
}

it('returns latest fifty chronologically and pages backwards', function () {
    $user = actingAsUser();
    $chat = chatWithHistory($user, 60);
    $response = $this->getJson("/api/v1/chats/{$chat->id}/messages")->assertOk()->assertJsonCount(50, 'data');
    expect($response->json('data.0.body'))->toBe('m11')->and($response->json('data.49.body'))->toBe('m60')
        ->and($response->json('next_after'))->toBeNull();
    $older = $this->getJson("/api/v1/chats/{$chat->id}/messages?".http_build_query(['before' => $response->json('next_before')]))
        ->assertOk()->assertJsonCount(10, 'data');
    expect($older->json('data.0.body'))->toBe('m1')->and($older->json('data.9.body'))->toBe('m10')
        ->and($older->json('next_before'))->toBeNull()->and($older->json('next_after'))->not->toBeNull();
});

it('catches up from the earliest next page without skipping middle messages', function () {
    $user = actingAsUser();
    $chat = chatWithHistory($user, 7);
    $cursor = MessageCursor::encode($chat->messages()->orderBy('created_at')->firstOrFail());
    foreach ([['m2', 'm3'], ['m4', 'm5'], ['m6', 'm7']] as $expected) {
        $response = $this->getJson("/api/v1/chats/{$chat->id}/messages?".http_build_query(['after' => $cursor, 'limit' => 2]))->assertOk();
        expect($response->json('data.*.body'))->toBe($expected);
        $cursor = $response->json('next_after');
    }
    expect($cursor)->toBeNull();
});

it('preserves microseconds and id ties across both cursor directions', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $time = CarbonImmutable::parse('2026-12-01T13:00:00.123456+03:00');
    $messages = collect();
    foreach (range(1, 4) as $i) {
        $messages->push(Message::factory()->for($chat)->from($user)->at($time->addMicroseconds(intdiv($i, 3)))->create());
    }
    $ordered = $chat->messages()->orderBy('created_at')->orderBy('id')->get();
    $response = $this->getJson("/api/v1/chats/{$chat->id}/messages?".http_build_query(['after' => MessageCursor::encode($ordered[0]), 'limit' => 2]))->assertOk();
    expect($response->json('data.*.id'))->toBe([$ordered[1]->id, $ordered[2]->id]);
    $response = $this->getJson("/api/v1/chats/{$chat->id}/messages?".http_build_query(['before' => MessageCursor::encode($ordered[3]), 'limit' => 2]))->assertOk();
    expect($response->json('data.*.id'))->toBe([$ordered[1]->id, $ordered[2]->id]);
});

it('validates cursors bounds and mutually exclusive directions', function () {
    $user = actingAsUser();
    $chat = chatWithHistory($user, 1);
    foreach ([['before' => 'junk'], ['limit' => 0], ['limit' => 101], ['before' => 'x', 'after' => 'y']] as $query) {
        $this->getJson("/api/v1/chats/{$chat->id}/messages?".http_build_query($query))->assertUnprocessable();
    }
    $this->getJson("/api/v1/chats/{$chat->id}/messages?before=junk")->assertJsonPath('code', 'cursor.invalid');
    $this->actingAs(User::factory()->create());
    $this->getJson("/api/v1/chats/{$chat->id}/messages?before=junk")->assertForbidden();
});

it('redacts deleted content attachments and reply references while retaining reply placeholders', function () {
    $user = actingAsUser();
    $chat = Chat::factory()->withMembers($user)->create();
    $original = Message::factory()->for($chat)->from($user)->create();
    $deleted = Message::factory()->for($chat)->from($user)->replyTo($original)->deleted()->create(['body' => 'secret', 'reply_to_id' => $original->id]);
    $deleted->attachments()->create(['media_id' => Media::factory()->create()->id, 'sort_order' => 0, 'created_at' => now()]);
    $reply = Message::factory()->for($chat)->from($user)->replyTo($deleted)->create();
    $data = collect($this->getJson("/api/v1/chats/{$chat->id}/messages")->assertOk()->json('data'))->keyBy('id');
    expect($data[$deleted->id]['body'])->toBeNull()->and($data[$deleted->id]['reply_to'])->toBeNull()
        ->and($data[$deleted->id]['attachments'])->toBe([])->and($data[$reply->id]['reply_to']['deleted'])->toBeTrue()
        ->and($data[$reply->id]['reply_to']['body_preview'])->toBeNull();
});

it('applies person visibility to sender and reply sender names and photos', function () {
    $viewer = actingAsUser();
    $sender = User::factory()->create();
    $photo = Media::factory()->create(['variants' => ['thumb' => 'thumb.jpg']]);
    $sender->person->update(['photo_media_id' => $photo->id]);
    $chat = Chat::factory()->withMembers($viewer, $sender)->create();
    $original = Message::factory()->for($chat)->from($sender)->create();
    $reply = Message::factory()->for($chat)->from($sender)->replyTo($original)->create();
    $data = collect($this->getJson("/api/v1/chats/{$chat->id}/messages")->assertOk()->json('data'))->keyBy('id');
    expect($data[$reply->id]['sender']['person']['id'])->toBe($sender->person_id)
        ->and($data[$reply->id]['sender']['person']['full_name'])->toBeNull()
        ->and($data[$reply->id]['sender']['person']['photo_thumb_url'])->toBeNull()
        ->and($data[$reply->id]['reply_to']['sender_name'])->toBeNull();
    $this->actingAs($sender);
    $data = collect($this->getJson("/api/v1/chats/{$chat->id}/messages")->assertOk()->json('data'))->keyBy('id');
    expect($data[$reply->id]['sender']['person']['full_name'])->toBe($sender->person->fullName())
        ->and($data[$reply->id]['sender']['person']['photo_thumb_url'])->not->toBeNull()
        ->and($data[$reply->id]['reply_to']['sender_name'])->toBe($sender->person->fullName());
});

it('allows read-only ministry readers and archived members to read history', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::query()->where('ministry_id', $ministry->id)->sole();
    $user = actingAsUserWith([Permission::MinistriesViewAll]);
    $this->getJson("/api/v1/chats/{$chat->id}/messages")->assertOk();
    $archived = Chat::factory()->withMembers($user)->archived()->create();
    $this->getJson("/api/v1/chats/{$archived->id}/messages")->assertOk()->assertJsonCount(0, 'data')
        ->assertJsonPath('next_before', null)->assertJsonPath('next_after', null);
});

it('documents exact message and cursor response types', function () {
    $schema = app(Generator::class)();
    $properties = $schema['components']['schemas']['MessageResource']['properties'];
    foreach (['id', 'chat_id', 'created_at', 'cursor'] as $field) {
        expect($properties[$field]['type'])->toBe('string');
    }
    foreach (['body', 'edited_at'] as $field) {
        expect($properties[$field]['type'])->toBe(['string', 'null']);
    }
    expect($properties['deleted']['type'])->toBe('boolean')
        ->and($properties['sender']['type'])->toBe(['object', 'null'])
        ->and($properties['sender']['properties']['id']['type'])->toBe('string')
        ->and($properties['sender']['properties']['person']['properties']['id']['type'])->toBe('string')
        ->and($properties['sender']['properties']['person']['properties']['full_name']['type'])->toBe(['string', 'null'])
        ->and($properties['sender']['properties']['person']['properties']['photo_thumb_url']['type'])->toBe(['string', 'null'])
        ->and($properties['reply_to']['type'])->toBe(['object', 'null'])
        ->and($properties['reply_to']['properties']['id']['type'])->toBe('string')
        ->and($properties['reply_to']['properties']['deleted']['type'])->toBe('boolean')
        ->and($properties['reply_to']['properties']['sender_name']['type'])->toBe(['string', 'null'])
        ->and($properties['reply_to']['properties']['body_preview']['type'])->toBe(['string', 'null'])
        ->and($properties['attachments']['type'])->toBe('array')
        ->and($properties['attachments']['items']['$ref'])->toBe('#/components/schemas/MediaResource');
    $history = $schema['paths']['/chats/{chat}/messages']['get']['responses'][200]['content']['application/json']['schema']['properties'];
    expect($history['data']['items']['$ref'])->toBe('#/components/schemas/MessageResource')
        ->and($history['next_before']['type'])->toBe(['string', 'null'])
        ->and($history['next_after']['type'])->toBe(['string', 'null']);
    $created = $schema['paths']['/chats/{chat}/messages']['post']['responses'][201]['content']['application/json']['schema']['properties'];
    expect($created['data']['$ref'])->toBe('#/components/schemas/MessageResource');
});
