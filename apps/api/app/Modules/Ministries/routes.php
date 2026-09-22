<?php

declare(strict_types=1);

use App\Modules\Ministries\Http\Controllers\MinistryController;
use App\Modules\Ministries\Http\Controllers\MinistryMemberController;
use App\Modules\Ministries\Http\Controllers\MinistryRoleController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('ministries', [MinistryController::class, 'index']);
    Route::post('ministries', [MinistryController::class, 'store']);
    Route::get('ministries/{ministry}', [MinistryController::class, 'show']);
    Route::patch('ministries/{ministry}', [MinistryController::class, 'update']);
    Route::post('ministries/{ministry}/archive', [MinistryController::class, 'archive']);

    Route::get('ministries/{ministry}/members', [MinistryMemberController::class, 'index']);
    Route::post('ministries/{ministry}/members', [MinistryMemberController::class, 'store']);
    Route::put('ministries/{ministry}/members/{member}/roles', [MinistryMemberController::class, 'updateRoles']);
    Route::delete('ministries/{ministry}/members/{member}', [MinistryMemberController::class, 'destroy']);

    Route::get('ministries/{ministry}/roles', [MinistryRoleController::class, 'index']);
    Route::post('ministries/{ministry}/roles', [MinistryRoleController::class, 'store']);
});
