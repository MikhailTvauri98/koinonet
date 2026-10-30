<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
use Symfony\Component\Process\Exception\ProcessTimedOutException;
use Symfony\Component\Process\Process;

uses(DatabaseMigrations::class);

it('serializes simultaneous reciprocal opening into one complete direct chat', function () {
    $a = User::factory()->create();
    $b = User::factory()->create();
    $role = Role::factory()->global()->withPermissions([Permission::ChatsDm])->create();
    foreach ([$a, $b] as $user) {
        $user->person->globalRoles()->attach($role);
    }
    $env = ['APP_ENV' => 'testing', 'DB_DATABASE' => 'church_test', 'CACHE_STORE' => 'array'];
    $barrier = tempnam(sys_get_temp_dir(), 'direct-chat-');
    unlink($barrier);
    $startBarrier = $barrier.'.start';
    $first = new Process([PHP_BINARY, base_path('tests/Support/open-direct-chat-worker.php'), $a->id, $b->id, $barrier], base_path(), $env, timeout: 45);
    $second = new Process([PHP_BINARY, base_path('tests/Support/open-direct-chat-worker.php'), $b->id, $a->id, '', $startBarrier], base_path(), $env, timeout: 45);
    $diagnostics = fn (): string => "\nFirst: ".($first->isStarted() ? $first->getOutput().$first->getErrorOutput() : 'not started')
        ."\nSecond: ".($second->isStarted() ? $second->getOutput().$second->getErrorOutput() : 'not started');
    try {
        // Bootstrap and load the reciprocal actor before holding account locks.
        $second->start();
        $deadline = microtime(true) + 15;
        while (! str_contains($second->getOutput(), 'PID=') && $second->isRunning() && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(str_contains($second->getOutput(), 'PID='))->toBeTrue($diagnostics());
        $first->start();
        $deadline = microtime(true) + 15;
        while (! str_contains($first->getOutput(), 'LOCKED') && $first->isRunning() && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect(str_contains($first->getOutput(), 'LOCKED'))->toBeTrue($diagnostics());
        touch($startBarrier);
        $blocked = false;
        $deadline = microtime(true) + 10;
        while ($second->isRunning() && microtime(true) < $deadline) {
            if (preg_match('/PID=(\d+)/', $second->getOutput(), $pid)) {
                $blocked = (bool) DB::scalar('select cardinality(pg_blocking_pids(?)) > 0', [(int) $pid[1]]);
                if ($blocked) {
                    break;
                }
            }
            usleep(10000);
        }
        expect($blocked)->toBeTrue('The reciprocal Action must actually wait on the first account lock.'.$diagnostics());
        touch($barrier);
        $first->wait();
        $second->wait();
        expect($first->getExitCode())->toBe(0, $diagnostics())
            ->and($second->getExitCode())->toBe(0, $diagnostics());
        $one = json_decode(trim(explode("\n", trim($first->getOutput()))[2]), true, flags: JSON_THROW_ON_ERROR);
        $two = json_decode(trim(explode("\n", trim($second->getOutput()))[2]), true, flags: JSON_THROW_ON_ERROR);
        expect($one['created'])->toBeTrue()->and($two['created'])->toBeFalse()
            ->and($one['id'])->toBe($two['id'])->and(Chat::query()->count())->toBe(1)
            ->and(ChatMember::query()->count())->toBe(2)
            ->and(ChatMember::query()->where('is_owner', true)->count())->toBe(0);
    } catch (ProcessTimedOutException $exception) {
        throw new RuntimeException($exception->getMessage().$diagnostics(), previous: $exception);
    } finally {
        $first->stop();
        $second->stop();
        if (is_file($barrier)) {
            unlink($barrier);
        }
        if (is_file($startBarrier)) {
            unlink($startBarrier);
        }
    }
});
