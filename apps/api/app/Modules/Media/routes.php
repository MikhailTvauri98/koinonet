<?php

declare(strict_types=1);

use App\Modules\Media\Http\Controllers\MediaController;
use App\Modules\Media\Http\Controllers\MediaDownloadController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('media', [MediaController::class, 'store']);
    Route::get('media/{media}', MediaDownloadController::class)->name('media.show')->middleware('signed');
    Route::delete('media/{media}', [MediaController::class, 'destroy']);
});
