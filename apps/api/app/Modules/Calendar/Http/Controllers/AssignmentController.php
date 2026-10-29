<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Controllers;

use App\Modules\Calendar\Actions\AssignPerson;
use App\Modules\Calendar\Actions\RemoveAssignment;
use App\Modules\Calendar\Http\Requests\AssignRequest;
use App\Modules\Calendar\Http\Resources\EventAssignmentResource;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Calendar\Models\EventSlot;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Dedoc\Scramble\Attributes\Response as OpenApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

final class AssignmentController
{
    #[OpenApiResponse(status: 201, type: "array{data: EventAssignmentResource, warnings: list<array{code: 'role_mismatch'|'time_conflict'|'over_capacity', message: string, event_ids?: list<string>}>}")]
    #[OpenApiResponse(status: 422, type: "array{message: string, code: 'assignment.duplicate'|'assignment.person_archived'|'event.cancelled'}")]
    public function store(AssignRequest $request, EventSlot $slot, AssignPerson $assign): JsonResponse
    {
        abort_if($slot->archived_at !== null || $slot->event->archived_at !== null, 404);
        Gate::authorize('assign', $slot);
        $actor = $request->user();
        assert($actor instanceof User);
        $result = $assign->handle($actor, $slot, Person::query()->findOrFail($request->string('person_id')->toString()));

        return (new EventAssignmentResource($result['assignment']))->additional(['warnings' => $result['warnings']])->response()->setStatusCode(201);
    }

    #[OpenApiResponse(status: 422, type: "array{message: string, code: 'event.cancelled'}")]
    public function destroy(EventAssignment $assignment, RemoveAssignment $remove): Response
    {
        abort_if($assignment->archived_at !== null || $assignment->slot->archived_at !== null || $assignment->slot->event->archived_at !== null, 404);
        Gate::authorize('delete', $assignment);
        $remove->handle($assignment);

        return response()->noContent();
    }
}
