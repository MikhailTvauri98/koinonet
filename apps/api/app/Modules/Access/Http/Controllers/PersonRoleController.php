<?php

declare(strict_types=1);

namespace App\Modules\Access\Http\Controllers;

use App\Modules\Access\Actions\SetPersonRoles;
use App\Modules\Access\Models\Role;
use App\Modules\Directory\Models\Person;
use Dedoc\Scramble\Attributes\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

final class PersonRoleController
{
    #[Response(status: 200, type: 'array{data: array{role_ids: list<string>}}')]
    public function __invoke(Request $request, Person $person, SetPersonRoles $setPersonRoles): JsonResponse
    {
        Gate::authorize('assignGlobalRoles', Role::class);

        /** @var array{role_ids: list<string>} $validated */
        $validated = $request->validate([
            'role_ids' => ['present', 'array'],
            'role_ids.*' => [
                'required',
                'string',
                'ulid',
                'distinct',
                Rule::exists('roles', 'id'),
            ],
        ]);

        $setPersonRoles->handle($person, $validated['role_ids']);

        return response()->json(['data' => ['role_ids' => $validated['role_ids']]]);
    }
}
