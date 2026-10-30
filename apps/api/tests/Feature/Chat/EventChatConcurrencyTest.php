<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Chat\Actions\CreateEventChat;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

uses(DatabaseMigrations::class);

it('serializes assignment against the create snapshot so its queued reconciliation cannot be lost', function (bool $existing) {
    $actor = actingAsUserWith([Permission::CalendarChurchManage]);
    $event = Event::factory()->create();
    $slot = EventSlot::factory()->for($event)->create();
    $user = User::factory()->create();
    if ($existing) {
        app(CreateEventChat::class)->handle($event, $actor);
    }
    $env = ['APP_ENV' => 'testing', 'DB_DATABASE' => 'church_test', 'CACHE_STORE' => 'array', 'QUEUE_CONNECTION' => 'sync'];
    $barrier = tempnam(sys_get_temp_dir(), 'event-chat-');
    unlink($barrier);
    $assignmentBarrier = $barrier.'.assign';
    $create = new Process([PHP_BINARY, base_path('tests/Support/event-chat-worker.php'), 'create', $actor->id, $event->id, $barrier], base_path(), $env, timeout: 45);
    $assign = new Process([PHP_BINARY, base_path('tests/Support/event-chat-worker.php'), 'assign', $actor->id, $slot->id, $user->person_id, $assignmentBarrier], base_path(), $env, timeout: 45);
    try {
        // Boot the assignment worker first; bootstrap time is not lock contention.
        $assign->start();
        $deadline = microtime(true) + 15;
        while (! str_contains($assign->getOutput(), 'PID=') && $assign->isRunning() && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect($assign->getOutput())->toContain('PID=');
        $create->start();
        $deadline = microtime(true) + 15;
        while (! str_contains($create->getOutput(), 'SNAPSHOT') && $create->isRunning() && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect($create->getOutput())->toContain('SNAPSHOT');
        touch($assignmentBarrier);
        $blocked = false;
        $deadline = microtime(true) + 10;
        while ($assign->isRunning() && microtime(true) < $deadline) {
            if (preg_match('/PID=(\d+)/', $assign->getOutput(), $pid)) {
                $blocked = (bool) DB::scalar('select cardinality(pg_blocking_pids(?)) > 0', [(int) $pid[1]]);
                if ($blocked) {
                    break;
                }
            }
            usleep(10000);
        }
        expect($blocked)->toBeTrue('Assignment must wait until the chat and its source snapshot commit.'
            ."\nCreate: ".$create->getOutput().$create->getErrorOutput()
            ."\nAssign: ".$assign->getOutput().$assign->getErrorOutput());
        touch($barrier);
        $create->wait();
        $assign->wait();
        expect($create->getExitCode())->toBe(0, $create->getErrorOutput())
            ->and($assign->getExitCode())->toBe(0, $assign->getErrorOutput());
        $chat = Chat::query()->where('event_id', $event->id)->sole();
        expect($chat->members()->pluck('user_id')->all())->toEqualCanonicalizing([$actor->id, $user->id]);
    } finally {
        $create->stop();
        $assign->stop();
        if (is_file($barrier)) {
            unlink($barrier);
        }
        if (is_file($assignmentBarrier)) {
            unlink($assignmentBarrier);
        }
    }
})->with(['new chat' => false, 'existing chat repair' => true]);
