<?php

declare(strict_types=1);

use App\Modules\Calendar\Http\Controllers\EventController;
use App\Modules\Calendar\Http\Controllers\SlotController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('events', [EventController::class, 'index']);
    Route::post('events', [EventController::class, 'store']);
    Route::get('events/{event}', [EventController::class, 'show']);
    Route::patch('events/{event}', [EventController::class, 'update']);
    Route::post('events/{event}/slots', [SlotController::class, 'store']);
    Route::patch('slots/{slot}', [SlotController::class, 'update']);
    Route::delete('slots/{slot}', [SlotController::class, 'destroy']);
});
