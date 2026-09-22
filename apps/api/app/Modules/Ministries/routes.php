<?php

declare(strict_types=1);

use App\Modules\Ministries\Http\Controllers\MinistryController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('ministries', [MinistryController::class, 'index']);
    Route::post('ministries', [MinistryController::class, 'store']);
    Route::get('ministries/{ministry}', [MinistryController::class, 'show']);
    Route::patch('ministries/{ministry}', [MinistryController::class, 'update']);
    Route::post('ministries/{ministry}/archive', [MinistryController::class, 'archive']);
});
