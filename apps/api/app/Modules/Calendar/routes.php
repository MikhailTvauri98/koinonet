<?php

declare(strict_types=1);

use App\Modules\Calendar\Http\Controllers\EventController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('events', [EventController::class, 'store']);
    Route::get('events/{event}', [EventController::class, 'show']);
    Route::patch('events/{event}', [EventController::class, 'update']);
});
