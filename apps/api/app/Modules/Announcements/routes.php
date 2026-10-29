<?php

declare(strict_types=1);

use App\Modules\Announcements\Http\Controllers\AnnouncementController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('announcements', [AnnouncementController::class, 'store']);
    Route::patch('announcements/{announcement}', [AnnouncementController::class, 'update']);
});
