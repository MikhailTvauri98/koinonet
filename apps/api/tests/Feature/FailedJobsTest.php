<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;

uses(RefreshDatabase::class);

it('records a failed queue job, so it can be inspected and retried', function () {
    $uuid = (string) Str::uuid();

    app('queue.failer')->log(
        'redis',
        'default',
        (string) json_encode(['uuid' => $uuid, 'displayName' => 'App\\Jobs\\Example']),
        new RuntimeException('Processing broke.'),
    );

    $failed = app('queue.failer')->find($uuid);

    expect($failed)->not->toBeNull()
        ->and($failed->exception)->toContain('Processing broke.');
});
