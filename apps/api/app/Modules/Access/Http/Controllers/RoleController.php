<?php

declare(strict_types=1);

namespace App\Modules\Access\Http\Controllers;

use App\Modules\Access\Actions\CreateRole;
use App\Modules\Access\Actions\DeleteRole;
use App\Modules\Access\Actions\UpdateRole;
use App\Modules\Access\Http\Requests\RoleRequest;
use App\Modules\Access\Http\Resources\RoleResource;
use App\Modules\Access\Models\Role;
use App\Modules\Access\Permission;
use App\Modules\Access\RoleScope;
use App\Modules\Access\RoleUsageCollector;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

final class RoleController
{
    public function index(Request $request): AnonymousResourceCollection
    {
        /** @var array{scope: string, ministry_id?: string|null} $validated */
        $validated = $request->validate([
            'scope' => ['required', Rule::in([RoleScope::Global->value])],
            'ministry_id' => ['prohibited'],
        ]);

        $scope = RoleScope::from($validated['scope']);
        $ministryId = $validated['ministry_id'] ?? null;
        Gate::authorize('viewAny', [Role::class, $scope, $ministryId]);

        $roles = Role::query()
            ->where('scope', $scope)
            ->where('ministry_id', $ministryId)
            ->with('permissions')
            ->orderByDesc('is_system')
            ->orderBy('name')
            ->get();

        return RoleResource::collection($roles);
    }

    public function store(RoleRequest $request, CreateRole $createRole): JsonResponse
    {
        /** @var array{scope: string, ministry_id?: string|null, name: string, description?: string|null, permissions: list<string>} $validated */
        $validated = $request->validated();
        $scope = RoleScope::from($validated['scope']);
        $ministryId = $validated['ministry_id'] ?? null;
        Gate::authorize('create', [Role::class, $scope, $ministryId]);

        $role = $createRole->handle(
            $scope,
            $ministryId,
            $validated['name'],
            $validated['description'] ?? null,
            array_map(Permission::from(...), $validated['permissions']),
        );

        return (new RoleResource($role))->response()->setStatusCode(201);
    }

    public function update(RoleRequest $request, Role $role, UpdateRole $updateRole): RoleResource
    {
        Gate::authorize('update', $role);

        /** @var array{name?: string, description?: string|null, permissions?: list<string>} $validated */
        $validated = $request->validated();
        $permissions = array_key_exists('permissions', $validated)
            ? array_map(Permission::from(...), $validated['permissions'])
            : null;

        return new RoleResource($updateRole->handle(
            $role,
            $validated['name'] ?? null,
            array_key_exists('description', $validated)
                ? $validated['description']
                : $role->description,
            $permissions,
        ));
    }

    public function destroy(Role $role, DeleteRole $deleteRole): Response
    {
        Gate::authorize('delete', $role);
        $deleteRole->handle($role);

        return response()->noContent();
    }

    /** @response array{data: array{carriers: int, blockers: list<array{type: string, id: string, title: string}>}} */
    public function usage(Role $role, RoleUsageCollector $usage): JsonResponse
    {
        Gate::authorize('viewUsage', $role);

        return response()->json(['data' => $usage->for($role)]);
    }
}
