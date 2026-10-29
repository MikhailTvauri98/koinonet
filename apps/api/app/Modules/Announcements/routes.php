<?php

declare(strict_types=1);

use App\Modules\Announcements\Http\Controllers\AnnouncementController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('announcements', [AnnouncementController::class, 'index']);
    Route::get('announcements/{announcement}', [AnnouncementController::class, 'show']);
    Route::post('announcements', [AnnouncementController::class, 'store']);
    Route::patch('announcements/{announcement}', [AnnouncementController::class, 'update']);
    Route::post('announcements/{announcement}/pin', [AnnouncementController::class, 'pin']);
    Route::post('announcements/{announcement}/unpin', [AnnouncementController::class, 'unpin']);
    Route::post('announcements/{announcement}/archive', [AnnouncementController::class, 'archive']);
});
