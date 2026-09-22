<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Http\Controllers;

use App\Modules\Access\Actions\CreateRole;
use App\Modules\Access\Http\Resources\RoleResource;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\RoleScope;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

final class MinistryRoleController
{
    public function index(Ministry $ministry): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', [Role::class, RoleScope::Ministry, $ministry->id]);

        $roles = $ministry->roles()->with('permissions')->orderBy('name')->get();

        return RoleResource::collection($roles);
    }

    public function store(Request $request, Ministry $ministry, CreateRole $createRole): JsonResponse
    {
        Gate::authorize('create', [Role::class, RoleScope::Ministry, $ministry->id]);

        /** @var array{name: string, description?: string|null, permissions: list<string>} $validated */
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:100'],
            'description' => ['sometimes', 'nullable', 'string'],
            'permissions' => ['present', 'array'],
            'permissions.*' => ['required', 'distinct', Rule::enum(Permission::class)],
        ]);

        $role = $createRole->handle(
            RoleScope::Ministry,
            $ministry->id,
            $validated['name'],
            $validated['description'] ?? null,
            array_map(Permission::from(...), $validated['permissions']),
        );

        return (new RoleResource($role))->response()->setStatusCode(201);
    }
}
