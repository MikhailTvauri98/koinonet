<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\User;
use Illuminate\Foundation\Testing\DatabaseMigrations;
use Illuminate\Support\Facades\DB;
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
    $first = new Process([PHP_BINARY, base_path('tests/Support/open-direct-chat-worker.php'), $a->id, $b->id, $barrier], base_path(), $env, timeout: 12);
    $second = new Process([PHP_BINARY, base_path('tests/Support/open-direct-chat-worker.php'), $b->id, $a->id], base_path(), $env, timeout: 12);
    try {
        $first->start();
        $deadline = microtime(true) + 8;
        while (! str_contains($first->getOutput(), 'LOCKED') && $first->isRunning() && microtime(true) < $deadline) {
            usleep(10000);
        }
        expect($first->getOutput())->toContain('LOCKED');
        $second->start();
        $blocked = false;
        $deadline = microtime(true) + 6;
        while ($second->isRunning() && microtime(true) < $deadline) {
            if (preg_match('/PID=(\d+)/', $second->getOutput(), $pid)) {
                $blocked = (bool) DB::scalar('select cardinality(pg_blocking_pids(?)) > 0', [(int) $pid[1]]);
                if ($blocked) {
                    break;
                }
            }
            usleep(10000);
        }
        expect($blocked)->toBeTrue('The reciprocal Action must actually wait on the first account lock.');
        touch($barrier);
        $first->wait();
        $second->wait();
        expect($first->getExitCode())->toBe(0, $first->getErrorOutput())
            ->and($second->getExitCode())->toBe(0, $second->getErrorOutput());
        $one = json_decode(trim(explode("\n", trim($first->getOutput()))[2]), true, flags: JSON_THROW_ON_ERROR);
        $two = json_decode(trim(explode("\n", trim($second->getOutput()))[2]), true, flags: JSON_THROW_ON_ERROR);
        expect($one['created'])->toBeTrue()->and($two['created'])->toBeFalse()
            ->and($one['id'])->toBe($two['id'])->and(Chat::query()->count())->toBe(1)
            ->and(ChatMember::query()->count())->toBe(2)
            ->and(ChatMember::query()->where('is_owner', true)->count())->toBe(0);
    } finally {
        $first->stop();
        $second->stop();
        if (is_file($barrier)) {
            unlink($barrier);
        }
    }
});
