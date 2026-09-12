<?php

declare(strict_types=1);

use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Route;

Route::prefix('v1')->group(function (): void {
    Route::get('health', #[Response(
        status: 200,
        description: 'Database and Redis are available.',
        type: "array{status: 'ok', database: true, redis: true}",
    )] #[Response(
        status: 503,
        description: 'Database or Redis is unavailable.',
        type: "array{status: 'degraded', database: bool, redis: bool}",
    )] function (): JsonResponse {
        $database = rescue(fn (): bool => DB::select('select 1') !== [], false, false);
        $redis = rescue(fn (): bool => Redis::connection()->ping() !== false, false, false);
        $ok = $database && $redis;

        return response()->json([
            'status' => $ok ? 'ok' : 'degraded',
            'database' => $database,
            'redis' => $redis,
        ], $ok ? 200 : 503);
    });
});
