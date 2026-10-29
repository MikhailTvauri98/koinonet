<?php

declare(strict_types=1);

use App\Modules\Notifications\Http\Controllers\NotificationCenterController;
use App\Modules\Notifications\Http\Controllers\NotificationSettingsController;
use App\Modules\Notifications\Http\Controllers\PushSubscriptionController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('notifications', [NotificationCenterController::class, 'index']);
    Route::post('notifications/read', [NotificationCenterController::class, 'read']);
    Route::get('notification-settings', [NotificationSettingsController::class, 'index']);
    Route::put('notification-settings', [NotificationSettingsController::class, 'update']);
    Route::post('push-subscriptions', [PushSubscriptionController::class, 'store']);
    Route::delete('push-subscriptions', [PushSubscriptionController::class, 'destroy']);
});
