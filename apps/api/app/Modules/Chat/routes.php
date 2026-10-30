<?php

declare(strict_types=1);

use App\Modules\Chat\Http\Controllers\ChatController;
use App\Modules\Chat\Http\Controllers\ChatReadController;
use App\Modules\Chat\Http\Controllers\MessageController;
use App\Modules\Chat\Http\Controllers\MuteController;
use App\Modules\Chat\Http\Controllers\PinController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('messages/{message}/pin', [PinController::class, 'store']);
    Route::delete('messages/{message}/pin', [PinController::class, 'destroy']);
    Route::get('messages/{message}', [MessageController::class, 'show']);
    Route::patch('messages/{message}', [MessageController::class, 'update']);
    Route::delete('messages/{message}', [MessageController::class, 'destroy']);
    Route::get('chats', [ChatController::class, 'index']);
    Route::get('chats/{chat}', [ChatController::class, 'show']);
    Route::post('chats/{chat}/read', ChatReadController::class);
    Route::post('chats/{chat}/mute', [MuteController::class, 'store']);
    Route::delete('chats/{chat}/mute', [MuteController::class, 'destroy']);
    Route::get('chats/{chat}/messages', [MessageController::class, 'index']);
    Route::post('chats/{chat}/messages', [MessageController::class, 'store']);
});
