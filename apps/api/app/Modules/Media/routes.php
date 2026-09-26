<?php

declare(strict_types=1);

use App\Modules\Media\Http\Controllers\MediaController;
use App\Modules\Media\Http\Controllers\MediaDownloadController;
use App\Modules\Media\Http\Controllers\MediaStatusController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('media', [MediaController::class, 'store']);
    Route::get('media/{media}', MediaDownloadController::class)->name('media.show')->middleware('signed');
    // JSON status read for MediaUploader's polling loop - a trailing path
    // segment, so it never overlaps the signed route above (see
    // MediaStatusController's docblock for why this exists).
    Route::get('media/{media}/status', MediaStatusController::class)->name('media.status');
    Route::delete('media/{media}', [MediaController::class, 'destroy']);
});
