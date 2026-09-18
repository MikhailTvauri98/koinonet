<?php

declare(strict_types=1);

use App\Modules\Access\Http\Controllers\AuditController;
use App\Modules\Access\Http\Controllers\PermissionCatalogController;
use Illuminate\Support\Facades\Route;

Route::get('permissions', PermissionCatalogController::class)->middleware('auth:sanctum');
Route::get('audit', AuditController::class)->middleware('auth:sanctum');
