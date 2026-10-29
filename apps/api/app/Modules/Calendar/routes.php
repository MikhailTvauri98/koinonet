<?php

declare(strict_types=1);

use App\Modules\Calendar\Http\Controllers\AssignmentController;
use App\Modules\Calendar\Http\Controllers\CandidateController;
use App\Modules\Calendar\Http\Controllers\EventController;
use App\Modules\Calendar\Http\Controllers\SlotController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('events', [EventController::class, 'index']);
    Route::post('events', [EventController::class, 'store']);
    Route::get('events/{event}', [EventController::class, 'show']);
    Route::patch('events/{event}', [EventController::class, 'update']);
    Route::post('events/{event}/cancel', [EventController::class, 'cancel']);
    Route::post('events/{event}/slots', [SlotController::class, 'store']);
    Route::patch('slots/{slot}', [SlotController::class, 'update']);
    Route::delete('slots/{slot}', [SlotController::class, 'destroy']);
    Route::get('slots/{slot}/candidates', [CandidateController::class, 'index']);
    Route::post('slots/{slot}/assignments', [AssignmentController::class, 'store']);
    Route::delete('assignments/{assignment}', [AssignmentController::class, 'destroy']);
});
