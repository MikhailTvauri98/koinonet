<?php

declare(strict_types=1);

use App\Modules\Directory\Http\Controllers\AuthController;
use App\Modules\Directory\Http\Controllers\PersonController;
use Illuminate\Support\Facades\Route;

Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);

    Route::get('people', [PersonController::class, 'index']);
    Route::post('people', [PersonController::class, 'store']);
    Route::get('people/{person}', [PersonController::class, 'show']);
    Route::patch('people/{person}', [PersonController::class, 'update']);
    Route::post('people/{person}/archive', [PersonController::class, 'archive']);
    Route::post('people/{person}/restore', [PersonController::class, 'restore']);
});
