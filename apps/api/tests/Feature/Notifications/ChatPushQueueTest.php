<?php

declare(strict_types=1);

use App\Modules\Chat\Actions\SendMessage;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\Push\PushTransport;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\Support\FakePushTransport;

uses(DatabaseMigrations::class);

afterEach(function () {
    if (isset($this->chatPushQueue)) {
        Queue::connection('redis')->clear($this->chatPushQueue);
    }
});

it('delivers committed message pushes through serialized listener and notification jobs but never rolled back messages', function () {
    $queue = $this->chatPushQueue = 'chat-push-'.str()->ulid();
    config()->set(['queue.default' => 'redis', 'queue.connections.redis.queue' => $queue, 'broadcasting.default' => 'log']);
    $sender = User::factory()->create();
    $recipient = User::factory()->create();
    PushSubscription::factory()->for($recipient)->create();
    $chat = Chat::factory()->withMembers($sender, $recipient)->create(['title' => 'Команда']);
    $transport = new FakePushTransport;
    app()->instance(PushTransport::class, $transport);
    DB::transaction(function () use ($sender, $chat, $queue): void {
        app(SendMessage::class)->handle($sender, $chat, 'Привет', [], null);
        expect(Queue::size($queue))->toBe(0);
    });
    expect(Queue::size($queue))->toBe(2);
    try {
        DB::transaction(function () use ($sender, $chat): void {
            app(SendMessage::class)->handle($sender, $chat, 'Откат', [], null);
            throw new RuntimeException('rollback');
        });
    } catch (RuntimeException $exception) {
        expect($exception->getMessage())->toBe('rollback');
    }
    expect(Queue::size($queue))->toBe(2);
    $this->artisan('queue:work', ['connection' => 'redis', '--queue' => $queue, '--stop-when-empty' => true, '--sleep' => 0, '--tries' => 1, '--memory' => 512])->assertSuccessful();
    expect($transport->sent)->toHaveCount(1)
        ->and($transport->sent[0]['payload'])->toMatchArray(['title' => 'Команда', 'body' => 'Участник: Привет'])
        ->and($recipient->notifications()->count())->toBe(0)->and(DB::table('failed_jobs')->count())->toBe(0);
});
