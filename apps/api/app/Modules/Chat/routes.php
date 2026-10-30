<?php

declare(strict_types=1);

use App\Modules\Chat\Http\Controllers\ChatController;
use App\Modules\Chat\Http\Controllers\MessageController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('chats', [ChatController::class, 'index']);
    Route::get('chats/{chat}', [ChatController::class, 'show']);
    Route::get('chats/{chat}/messages', [MessageController::class, 'index']);
    Route::post('chats/{chat}/messages', [MessageController::class, 'store']);
});
