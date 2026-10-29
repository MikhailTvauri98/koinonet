<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;
use Dedoc\Scramble\Generator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Pagination\Cursor;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

/** @param array<string, mixed> $overrides */
function centerEntry(User $user, array $overrides = []): DatabaseNotification
{
    return DatabaseNotification::query()->create([
        'id' => (string) Str::uuid(), 'type' => 'Sample', 'notifiable_type' => $user->getMorphClass(),
        'notifiable_id' => $user->id,
        'data' => ['category' => 'announcements', 'title' => 'Т', 'body' => 'Б', 'url' => '/a/1', 'tag' => 'a-1'],
        'read_at' => null, 'created_at' => now(), 'updated_at' => now(), ...$overrides,
    ]);
}

it('requires a session for the center and read action', function () {
    $this->getJson('/api/v1/notifications')->assertUnauthorized();
    $this->postJson('/api/v1/notifications/read', ['all' => true])->assertUnauthorized();
});

it('lists own notifications newest first with UTC dates and the total unread count', function () {
    $this->freezeSecond();
    $user = actingAsUser();
    $old = centerEntry($user, ['created_at' => now()->subHour(), 'read_at' => now()]);
    $new = centerEntry($user);
    centerEntry(User::factory()->create());

    $this->getJson('/api/v1/notifications')->assertOk()->assertExactJson([
        'data' => [
            ['id' => $new->id, 'category' => 'announcements', 'title' => 'Т', 'body' => 'Б', 'url' => '/a/1', 'read_at' => null, 'created_at' => now()->toISOString()],
            ['id' => $old->id, 'category' => 'announcements', 'title' => 'Т', 'body' => 'Б', 'url' => '/a/1', 'read_at' => now()->toISOString(), 'created_at' => now()->subHour()->toISOString()],
        ], 'next_cursor' => null, 'meta' => ['unread_count' => 1],
    ]);
});

it('does not show notifications or unread counts of another account', function () {
    actingAsUser();
    centerEntry(User::factory()->create());

    $this->getJson('/api/v1/notifications')->assertOk()->assertExactJson([
        'data' => [], 'next_cursor' => null, 'meta' => ['unread_count' => 0],
    ]);
});

it('paginates thirty entries without skipping tied timestamps', function () {
    $this->freezeSecond();
    $user = actingAsUser();
    $ids = collect(range(1, 35))->map(fn () => centerEntry($user)->id)->sortDesc()->values()->all();

    $first = $this->getJson('/api/v1/notifications')->assertOk()->assertJsonCount(30, 'data')
        ->assertJsonPath('meta.unread_count', 35);
    expect(array_column($first->json('data'), 'id'))->toBe(array_slice($ids, 0, 30));
    $cursor = $first->json('next_cursor');
    expect($cursor)->toBeString();

    $last = $this->getJson('/api/v1/notifications?cursor='.urlencode($cursor))->assertOk()
        ->assertJsonCount(5, 'data')->assertJsonPath('next_cursor', null)->assertJsonPath('meta.unread_count', 35);
    expect(array_column($last->json('data'), 'id'))->toBe(array_slice($ids, 30));
});

it('marks only selected own entries read and preserves their initial read time', function () {
    $this->freezeSecond();
    $user = actingAsUser();
    $selected = centerEntry($user);
    $untouched = centerEntry($user);
    $foreign = centerEntry(User::factory()->create());
    $readAt = now()->toISOString();

    $this->postJson('/api/v1/notifications/read', ['ids' => [$selected->id, $foreign->id, (string) Str::uuid()]])
        ->assertOk()->assertExactJson(['unread_count' => 1]);
    $this->travel(5)->minutes();
    $this->postJson('/api/v1/notifications/read', ['ids' => [$selected->id]])
        ->assertOk()->assertExactJson(['unread_count' => 1]);

    expect($selected->fresh()->read_at->toISOString())->toBe($readAt)
        ->and($untouched->fresh()->read_at)->toBeNull()->and($foreign->fresh()->read_at)->toBeNull();
});

it('marks all own unread entries and leaves foreign entries and read dates alone', function () {
    $this->freezeSecond();
    $user = actingAsUser();
    $unread = centerEntry($user);
    $read = centerEntry($user, ['read_at' => now()->subHour()]);
    $foreign = centerEntry(User::factory()->create());

    $this->postJson('/api/v1/notifications/read', ['all' => true])->assertOk()->assertExactJson(['unread_count' => 0]);

    expect($unread->fresh()->read_at->toISOString())->toBe(now()->toISOString())
        ->and($read->fresh()->read_at->toISOString())->toBe(now()->subHour()->toISOString())
        ->and($foreign->fresh()->read_at)->toBeNull();
});

it('rejects invalid or ambiguous read selections without changing entries', function (array $payload) {
    $user = actingAsUser();
    $entry = centerEntry($user);

    $this->postJson('/api/v1/notifications/read', $payload)->assertUnprocessable();
    expect($entry->fresh()->read_at)->toBeNull();
})->with([
    'missing selection' => [[]], 'false all' => [['all' => false]], 'numeric all' => [['all' => 1]],
    'string all' => [['all' => 'true']], 'null all' => [['all' => null]],
    'empty ids' => [['ids' => []]], 'null ids' => [['ids' => null]], 'scalar ids' => [['ids' => 'bad']],
    'invalid uuid' => [['ids' => ['bad']]],
    'object ids' => [['ids' => ['key' => '8c545e23-3778-44bb-8afe-9d9d5113f144']]],
    'both selections' => [['ids' => ['8c545e23-3778-44bb-8afe-9d9d5113f144'], 'all' => true]],
    'ids with false all' => [['ids' => ['8c545e23-3778-44bb-8afe-9d9d5113f144'], 'all' => false]],
]);

it('validates the cursor shape', function () {
    actingAsUser();

    $this->getJson('/api/v1/notifications?cursor[]=invalid')->assertUnprocessable()->assertJsonValidationErrors('cursor');
});

it('rejects malformed encoded cursors with a Russian validation error', function (string $cursor) {
    actingAsUser();

    $this->getJson('/api/v1/notifications?cursor='.urlencode($cursor))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('cursor')
        ->assertJsonPath('errors.cursor.0', 'Недопустимый курсор уведомлений.');
})->with([
    'missing ordered fields' => ['eyJfcG9pbnRzVG9OZXh0SXRlbXMiOnRydWV9'],
    'not base64 JSON' => ['invalid!'],
    'invalid UUID' => [(new Cursor(['created_at' => '2026-10-29 10:00:00', 'id' => 'bad']))->encode()],
    'nonstring UUID' => [(new Cursor(['created_at' => '2026-10-29 10:00:00', 'id' => []]))->encode()],
    'invalid date' => [(new Cursor(['created_at' => '2026-02-30 10:00:00', 'id' => '8c545e23-3778-44bb-8afe-9d9d5113f144']))->encode()],
    'invalid time' => [(new Cursor(['created_at' => '2026-10-29 25:00:00', 'id' => '8c545e23-3778-44bb-8afe-9d9d5113f144']))->encode()],
    'SQL invalid year zero' => [(new Cursor(['created_at' => '0000-10-29 10:00:00', 'id' => '8c545e23-3778-44bb-8afe-9d9d5113f144']))->encode()],
    'SQL timestamp injection' => [(new Cursor(['created_at' => "2026-10-29 10:00:00'", 'id' => '8c545e23-3778-44bb-8afe-9d9d5113f144']))->encode()],
    'nonstring timestamp' => [(new Cursor(['created_at' => [], 'id' => '8c545e23-3778-44bb-8afe-9d9d5113f144']))->encode()],
    'nonboolean direction' => [(new Cursor(['created_at' => '2026-10-29 10:00:00', 'id' => '8c545e23-3778-44bb-8afe-9d9d5113f144'], 'next'))->encode()],
    'missing direction' => [rtrim(strtr(base64_encode('{"created_at":"2026-10-29 10:00:00","id":"8c545e23-3778-44bb-8afe-9d9d5113f144"}'), '+/', '-_'), '=')],
]);

it('accepts a generated cursor pointing to previous items', function () {
    $this->freezeSecond();
    $user = actingAsUser();
    $older = centerEntry($user, ['created_at' => now()->subMinute()]);
    $newer = centerEntry($user);
    $cursor = (new Cursor(['created_at' => $older->created_at->toDateTimeString(), 'id' => $older->id], false))->encode();

    $this->getJson('/api/v1/notifications?cursor='.urlencode($cursor))->assertOk()
        ->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $newer->id);
});

it('returns Russian validation errors for read selections', function () {
    actingAsUser();

    $response = $this->postJson('/api/v1/notifications/read', ['all' => false])->assertUnprocessable();
    expect($response->json('errors.all.0'))->toBe('Поле «все уведомления» должно быть принято.');
});

it('documents the center payload and exclusive read selection', function () {
    $schema = app(Generator::class)();
    $paths = $schema['paths'];
    $response = $paths['/notifications']['get']['responses']['200']['content']['application/json']['schema'];
    expect($response['properties']['meta']['properties']['unread_count']['type'])->toBe('integer')
        ->and($response['properties']['next_cursor']['type'])->toBe(['string', 'null']);
    $selection = $schema['components']['schemas']['MarkNotificationsReadRequest'];
    expect($selection['oneOf'])->toHaveCount(2);
    expect($paths['/notifications/read']['post']['requestBody']['required'] ?? false)->toBeTrue();
});
