<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Http\Controllers;

use App\Modules\Directory\Models\Person;
use App\Modules\Ministries\Actions\AddMember;
use App\Modules\Ministries\Actions\RemoveMember;
use App\Modules\Ministries\Actions\SetMemberRoles;
use App\Modules\Ministries\Http\Resources\MemberResource;
use App\Modules\Ministries\Models\Ministry;
use App\Modules\Ministries\Models\MinistryMember;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

final class MinistryMemberController
{
    public function index(Ministry $ministry): AnonymousResourceCollection
    {
        Gate::authorize('view', $ministry);

        return MemberResource::collection(
            $ministry->members()->with(['roles', 'person.photo'])->orderBy('joined_at')->get(),
        );
    }

    public function store(Request $request, Ministry $ministry, AddMember $addMember): JsonResponse
    {
        Gate::authorize('manageMembers', $ministry);

        /** @var array{person_id: string, role_ids?: list<string>} $validated */
        $validated = $request->validate([
            'person_id' => ['required', 'string', 'ulid', Rule::exists('people', 'id')],
            'role_ids' => ['sometimes', 'array'],
            'role_ids.*' => [
                'required',
                'string',
                'ulid',
                'distinct',
                Rule::exists('roles', 'id')->where('ministry_id', $ministry->id),
            ],
        ]);

        $person = Person::query()->findOrFail($validated['person_id']);
        $member = $addMember->handle($ministry, $person, $validated['role_ids'] ?? []);

        return (new MemberResource($member))->response()->setStatusCode(201);
    }

    public function updateRoles(
        Request $request,
        Ministry $ministry,
        MinistryMember $member,
        SetMemberRoles $setMemberRoles,
    ): MemberResource {
        Gate::authorize('manageMembers', $ministry);
        abort_if($member->ministry_id !== $ministry->id, 404);

        /** @var array{role_ids: list<string>} $validated */
        $validated = $request->validate([
            'role_ids' => ['present', 'array'],
            'role_ids.*' => ['required', 'string', 'ulid', 'distinct', Rule::exists('roles', 'id')],
        ]);

        return new MemberResource($setMemberRoles->handle($ministry, $member, $validated['role_ids']));
    }

    public function destroy(Ministry $ministry, MinistryMember $member, RemoveMember $removeMember): Response
    {
        Gate::authorize('manageMembers', $ministry);
        abort_if($member->ministry_id !== $ministry->id, 404);

        $removeMember->handle($ministry, $member);

        return response()->noContent();
    }
}
