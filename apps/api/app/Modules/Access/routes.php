<?php

declare(strict_types=1);

use App\Modules\Access\Http\Controllers\AuditController;
use App\Modules\Access\Http\Controllers\PermissionCatalogController;
use App\Modules\Access\Http\Controllers\PersonRoleController;
use App\Modules\Access\Http\Controllers\RoleController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function (): void {
    Route::get('permissions', PermissionCatalogController::class);
    Route::get('audit', AuditController::class);
    Route::get('roles', [RoleController::class, 'index']);
    Route::post('roles', [RoleController::class, 'store']);
    Route::patch('roles/{role}', [RoleController::class, 'update']);
    Route::delete('roles/{role}', [RoleController::class, 'destroy']);
    Route::get('roles/{role}/usage', [RoleController::class, 'usage']);
    Route::put('people/{person}/roles', PersonRoleController::class);
});
