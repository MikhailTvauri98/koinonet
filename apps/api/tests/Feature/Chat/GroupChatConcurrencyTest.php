<?php

declare(strict_types=1);

use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Process;

uses(DatabaseMigrations::class);

it('allows sending while a group mutation waits on the same chat without an account foreign key deadlock', function () {
    expect(DB::connection()->getDatabaseName())->toBe('church_test');
    expect(config('cache.default'))->toBe('array');
    $actor = User::factory()->create();
    $chat = Chat::factory()->create(['created_by_user_id' => $actor->id, 'title' => 'Прежнее']);
    $env = ['APP_ENV' => 'testing', 'DB_DATABASE' => 'church_test', 'CACHE_STORE' => 'array', 'QUEUE_CONNECTION' => 'sync'];
    $sendBarrier = tempnam(sys_get_temp_dir(), 'group-send-');
    unlink($sendBarrier);
    $renameBarrier = $sendBarrier.'.rename';
    $send = new Process([PHP_BINARY, base_path('tests/Support/group-chat-concurrency-worker.php'), 'send', $actor->id, $chat->id, $sendBarrier], base_path(), $env, timeout: 45);
    $rename = new Process([PHP_BINARY, base_path('tests/Support/group-chat-concurrency-worker.php'), 'rename', $actor->id, $chat->id, $renameBarrier], base_path(), $env, timeout: 45);
    $diagnostics = fn (): string => "\nSend: ".($send->isStarted() ? $send->getOutput().$send->getErrorOutput() : 'not started')."\nRename: ".($rename->isStarted() ? $rename->getOutput().$rename->getErrorOutput() : 'not started');
    try {
        // Worker bootstrap is completed before either worker contends on a lock.
        $rename->start();
        $deadline = microtime(true) + 15;
        while (! str_contains($rename->getOutput(), 'READY') && $rename->isRunning() && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(str_contains($rename->getOutput(), 'READY'))->toBeTrue($diagnostics());
        $send->start();
        $deadline = microtime(true) + 15;
        while (! str_contains($send->getOutput(), 'CHAT_LOCKED') && $send->isRunning() && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(str_contains($send->getOutput(), 'CHAT_LOCKED'))->toBeTrue($diagnostics());
        preg_match('/PID=(\d+)/', $send->getOutput(), $senderPid);
        preg_match('/PID=(\d+)/', $rename->getOutput(), $renamePid);
        touch($renameBarrier);
        $blocked = false;
        $deadline = microtime(true) + 10;
        while ($rename->isRunning() && microtime(true) < $deadline) {
            $blocked = (bool) DB::scalar('select ? = any(pg_blocking_pids(?))', [(int) $senderPid[1], (int) $renamePid[1]]);
            if ($blocked) {
                break;
            }
            usleep(10000);
        }
        expect($blocked)->toBeTrue('The actual rename Action must wait on the sender chat lock.'.$diagnostics());
        expect(str_contains($rename->getOutput(), 'USER_LOCKED'))->toBeTrue($diagnostics());
        touch($sendBarrier);
        $send->wait();
        $rename->wait();
        expect(str_contains($send->getOutput(), 'SENT'))->toBeTrue($diagnostics());
        expect(str_contains($rename->getOutput(), 'RENAMED'))->toBeTrue($diagnostics());
        expect($send->getExitCode())->toBe(0, $diagnostics())
            ->and($rename->getExitCode())->toBe(0, $diagnostics());
        expect($chat->fresh()->title)->toBe('Новое')
            ->and($chat->messages()->sole()->body)->toBe('Параллельное сообщение');
    } finally {
        $send->stop();
        $rename->stop();
        foreach ([$sendBarrier, $renameBarrier] as $barrier) {
            if (is_file($barrier)) {
                unlink($barrier);
            }
        }
    }
});
