<?php

declare(strict_types=1);

use Symfony\Component\Process\Process;

it('rejects unsafe cached configuration before RefreshDatabase runs', function (string $url, string $mode): void {
    $process = new Process([PHP_BINARY, __DIR__.'/../Support/database-guard-probe.php', $url, $mode], dirname(__DIR__, 2), [
        'DB_DATABASE' => 'church_test', 'DB_URL' => '', 'DB_HOST' => '127.0.0.1',
        'DB_PORT' => '1', 'CACHE_STORE' => 'array',
    ]);
    $process->mustRun();

    expect($process->getOutput())->toContain('Unsafe test database configuration')
        ->not->toContain('REFRESH_DATABASE_REACHED');
})->with([
    'unsafe database in URL' => ['postgres://unused:unused@127.0.0.1:1/unsafe_probe', ''],
    'query overrides safe path' => ['postgres://unused:unused@127.0.0.1:1/church_test?database=unsafe_probe', ''],
    'split write variant' => ['postgres://unused:unused@127.0.0.1:1/church_test', 'split'],
]);

it('allows a safe test database to reach the migration sentinel', function (string $mode): void {
    $process = new Process([PHP_BINARY, __DIR__.'/../Support/database-guard-probe.php', 'postgres://unused:unused@127.0.0.1:1/church_test', $mode], dirname(__DIR__, 2), [
        'DB_DATABASE' => 'church_test', 'DB_URL' => '', 'DB_HOST' => '127.0.0.1',
        'DB_PORT' => '1', 'CACHE_STORE' => 'array',
    ]);
    $process->mustRun();

    expect($process->getOutput())->toBe('REFRESH_DATABASE_REACHED');
})->with(['dedicated postgres' => [''], 'sqlite memory' => ['sqlite']]);
