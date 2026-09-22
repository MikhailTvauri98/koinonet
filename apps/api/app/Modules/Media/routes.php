<?php

declare(strict_types=1);

use App\Modules\Media\Http\Controllers\MediaUploadController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('media', [MediaUploadController::class, 'store']);
});
