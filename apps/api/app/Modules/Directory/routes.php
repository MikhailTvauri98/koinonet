<?php

declare(strict_types=1);

use App\Modules\Directory\Http\Controllers\AccessLinkController;
use App\Modules\Directory\Http\Controllers\AuthController;
use App\Modules\Directory\Http\Controllers\InvitationController;
use App\Modules\Directory\Http\Controllers\PersonController;
use Illuminate\Support\Facades\Route;

Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::get('access-links/{token}', [AccessLinkController::class, 'show']);
Route::post('access-links/{token}/accept', [AccessLinkController::class, 'accept'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);

    Route::get('people', [PersonController::class, 'index']);
    Route::post('people', [PersonController::class, 'store']);
    Route::get('people/{person}', [PersonController::class, 'show']);
    Route::patch('people/{person}', [PersonController::class, 'update']);
    Route::post('people/{person}/archive', [PersonController::class, 'archive']);
    Route::post('people/{person}/restore', [PersonController::class, 'restore']);
    Route::post('people/{person}/invite', [InvitationController::class, 'invite']);
    Route::post('people/{person}/password-reset-link', [InvitationController::class, 'passwordReset']);
});
