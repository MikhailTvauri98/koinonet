<?php

declare(strict_types=1);

use App\Modules\Calendar\Models\Event;
use App\Modules\Chat\ChatType;
use App\Modules\Chat\MessageCursor;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Chat\Models\ChatPinnedMessage;
use App\Modules\Chat\Models\Message;
use App\Modules\Directory\Models\User;
use App\Modules\Media\MediaUsage;
use App\Modules\Media\Models\Media;
use App\Modules\Media\Models\MediaAttachment;
use Carbon\CarbonImmutable;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

it('allows one chat per ministry', function () {
    $ministry = ministryWithRoles();
    $chat = Chat::factory()->ministry($ministry)->create();
    expect($chat->title)->toBeNull();
    expect(fn () => Chat::factory()->ministry($ministry)->create())->toThrow(QueryException::class);
});
it('allows one chat per event', function () {
    $event = Event::factory()->create();
    $chat = Chat::factory()->event($event)->create();
    expect($chat->title)->toBeNull();
    expect(fn () => Chat::factory()->event($event)->create())->toThrow(QueryException::class);
});
it('keeps the direct key unique and order independent', function () {
    [$a, $b] = User::factory()->count(2)->create();
    $chat = Chat::factory()->direct($a, $b)->create();
    expect($chat->created_by_user_id)->toBe($a->id)
        ->and($chat->type)->toBe(ChatType::Direct)
        ->and($chat->members)->toHaveCount(2)
        ->and(Chat::directKey($a->id, $b->id))->toBe(Chat::directKey($b->id, $a->id));
    expect(fn () => Chat::factory()->direct($b, $a)->create())->toThrow(QueryException::class);
});
it('rejects inconsistent chat types and links', function (array $attributes) {
    expect(fn () => DB::table('chats')->insert(array_merge(['id' => (string) Str::ulid(), 'created_at' => now(), 'updated_at' => now()], $attributes)))->toThrow(QueryException::class);
})->with([
    [['type' => 'ministry']], [['type' => 'event']], [['type' => 'direct']],
    [['type' => 'group']], [['type' => 'unknown', 'title' => 'Чат']],
    [['type' => 'group', 'title' => 'Чат', 'direct_key' => 'unexpected']],
]);
it('has one membership per account and chat', function () {
    $chat = Chat::factory()->create();
    $member = $chat->members()->firstOrFail();
    expect(fn () => ChatMember::query()->create($member->getAttributes()))->toThrow(QueryException::class);
});
it('pins a message only once even across chats', function () {
    $chat = Chat::factory()->create();
    $message = Message::factory()->for($chat)->create();
    ChatPinnedMessage::query()->create(['chat_id' => $chat->id, 'message_id' => $message->id, 'pinned_at' => now()]);
    $other = Chat::factory()->create();
    expect(fn () => ChatPinnedMessage::query()->create(['chat_id' => $other->id, 'message_id' => $message->id, 'pinned_at' => now()]))->toThrow(QueryException::class);
});
it('limits message text to 4000 characters', function () {
    Message::factory()->create(['body' => str_repeat('я', 4000)]);
    expect(fn () => Message::factory()->create(['body' => str_repeat('я', 4001)]))->toThrow(QueryException::class);
});
it('persists microseconds and ordered message ULIDs with their relationships', function () {
    $chat = Chat::factory()->archived()->create();
    $moment = CarbonImmutable::parse('2026-12-01 10:00:00.123456', 'UTC');
    $first = Message::factory()->for($chat)->at($moment)->create();
    usleep(2000);
    $second = Message::factory()->for($chat)->replyTo($first)->create();
    $chat->update(['last_message_id' => $second->id]);
    $media = Media::factory()->create();
    MediaAttachment::query()->create(['media_id' => $media->id, 'attachable_type' => 'message', 'attachable_id' => $first->id, 'sort_order' => 0, 'created_at' => now()]);
    expect($first->fresh()->created_at->format('u'))->toBe('123456')
        ->and(MessageCursor::decode(MessageCursor::encode($first->fresh()))['created_at']->format('u'))->toBe('123456')
        ->and(strcmp($second->id, $first->id))->toBeGreaterThan(0)
        ->and($second->replyTo->id)->toBe($first->id)
        ->and($second->isDeleted())->toBeFalse()
        ->and($first->sender)->toBeInstanceOf(User::class)
        ->and($first->attachments)->toHaveCount(1)
        ->and($chat->lastMessage->id)->toBe($second->id)
        ->and($chat->messages)->toHaveCount(2)
        ->and($chat->archived_at)->not->toBeNull();
});
it('updates and deletes only the matching composite membership and pin', function () {
    $a = User::factory()->create();
    $b = User::factory()->create();
    $chat = Chat::factory()->withMembers($a, $b)->create();
    $member = $chat->members()->where('user_id', $a->id)->firstOrFail();
    $member->update(['muted_until' => now()->addDay()]);
    expect($member->isMuted())->toBeTrue()
        ->and($chat->members()->where('user_id', $b->id)->firstOrFail()->isMuted())->toBeFalse();
    $member->delete();
    expect($chat->members()->where('user_id', $b->id)->exists())->toBeTrue();
    $first = Message::factory()->for($chat)->create();
    $second = Message::factory()->for($chat)->create();
    $pin = ChatPinnedMessage::query()->create(['chat_id' => $chat->id, 'message_id' => $first->id, 'pinned_at' => now()]);
    ChatPinnedMessage::query()->create(['chat_id' => $chat->id, 'message_id' => $second->id, 'pinned_at' => now()]);
    $pin->update(['pinned_by_user_id' => $a->id]);
    expect($chat->pins()->where('message_id', $second->id)->firstOrFail()->pinned_by_user_id)->toBeNull();
    $pin->delete();
    expect($chat->pins)->toHaveCount(1);
});
it('erases account references while retaining messages and other members', function () {
    $user = User::factory()->create();
    $other = User::factory()->create();
    $chat = Chat::factory()->withMembers($user, $other)->create(['created_by_user_id' => $user->id]);
    $message = Message::factory()->for($chat)->from($user)->create(['body' => 'Привет']);
    ChatPinnedMessage::query()->create(['chat_id' => $chat->id, 'message_id' => $message->id, 'pinned_by_user_id' => $user->id, 'pinned_at' => now()]);
    $this->artisan('people:erase', ['id' => $user->person_id, '--force' => true])->assertSuccessful();
    expect(ChatMember::query()->where('user_id', $user->id)->exists())->toBeFalse()
        ->and($message->fresh()->sender_user_id)->toBeNull()
        ->and($message->fresh()->body)->toBe('Привет')
        ->and($chat->fresh()->created_by_user_id)->toBeNull()
        ->and($chat->pins()->firstOrFail()->pinned_by_user_id)->toBeNull()
        ->and($chat->members()->where('user_id', $other->id)->exists())->toBeTrue();
});
it('counts chat avatars as used media', function () {
    $media = Media::factory()->create();
    Chat::factory()->create(['avatar_media_id' => $media->id]);
    expect(app(MediaUsage::class)->isUsed($media))->toBeTrue();
});

it('represents deleted messages and expired or active mute periods', function () {
    $deleted = Message::factory()->deleted()->create();
    expect($deleted->isDeleted())->toBeTrue()->and($deleted->body)->toBeNull();
    $member = Chat::factory()->create()->members()->firstOrFail();
    expect($member->isMuted())->toBeFalse();
    $member->muted_until = now()->subSecond();
    expect($member->isMuted())->toBeFalse();
    $member->muted_until = now()->addSecond();
    expect($member->isMuted())->toBeTrue();
});

it('creates a group with an owner and deduplicates requested members', function () {
    $user = User::factory()->create();
    $chat = Chat::factory()->withMembers($user, $user)->create();
    expect($chat->type)->toBe(ChatType::Group)
        ->and($chat->title)->not->toBeEmpty()
        ->and($chat->members()->where('is_owner', true)->sole()->user_id)->toBe($chat->created_by_user_id)
        ->and($chat->members()->where('user_id', $user->id)->count())->toBe(1);
});
