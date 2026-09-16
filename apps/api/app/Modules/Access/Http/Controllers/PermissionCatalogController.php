<?php

declare(strict_types=1);

namespace App\Modules\Access\Http\Controllers;

use App\Modules\Access\Http\Resources\PermissionResource;
use App\Modules\Access\Permission;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class PermissionCatalogController
{
    public function __invoke(): AnonymousResourceCollection
    {
        return PermissionResource::collection(Permission::cases());
    }
}
