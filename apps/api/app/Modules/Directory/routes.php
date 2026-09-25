<?php

declare(strict_types=1);

use App\Modules\Directory\Http\Controllers\AccessLinkController;
use App\Modules\Directory\Http\Controllers\AuthController;
use App\Modules\Directory\Http\Controllers\InvitationController;
use App\Modules\Directory\Http\Controllers\PersonController;
use App\Modules\Directory\Http\Controllers\ProfileController;
use App\Modules\Directory\Http\Controllers\SessionController;
use Illuminate\Support\Facades\Route;

Route::post('auth/login', [AuthController::class, 'login'])->middleware('throttle:10,1');
Route::get('access-links/{token}', [AccessLinkController::class, 'show']);
Route::post('access-links/{token}/accept', [AccessLinkController::class, 'accept'])->middleware('throttle:10,1');

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('auth/logout', [AuthController::class, 'logout']);
    Route::get('auth/me', [AuthController::class, 'me']);
    Route::get('auth/sessions', [SessionController::class, 'index']);
    Route::delete('auth/sessions/{session}', [SessionController::class, 'destroy']);
    Route::post('auth/sessions/logout-others', [SessionController::class, 'logoutOthers']);

    Route::get('me/profile', [ProfileController::class, 'show']);
    Route::patch('me/profile', [ProfileController::class, 'update']);
    Route::put('me/photo', [ProfileController::class, 'updatePhoto']);
    Route::patch('me/login', [ProfileController::class, 'updateLogin']);
    Route::patch('me/password', [ProfileController::class, 'updatePassword']);

    Route::get('people', [PersonController::class, 'index']);
    Route::post('people', [PersonController::class, 'store']);
    Route::get('people/{person}', [PersonController::class, 'show']);
    Route::patch('people/{person}', [PersonController::class, 'update']);
    Route::put('people/{person}/photo', [PersonController::class, 'updatePhoto']);
    Route::post('people/{person}/archive', [PersonController::class, 'archive']);
    Route::post('people/{person}/restore', [PersonController::class, 'restore']);
    Route::post('people/{person}/invite', [InvitationController::class, 'invite']);
    Route::post('people/{person}/password-reset-link', [InvitationController::class, 'passwordReset']);
    Route::post('people/{person}/disable', [InvitationController::class, 'disable']);
    Route::post('people/{person}/enable', [InvitationController::class, 'enable']);
});
