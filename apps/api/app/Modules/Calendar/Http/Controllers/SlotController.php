<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Controllers;

use App\Modules\Calendar\Actions\AddSlot;
use App\Modules\Calendar\Actions\RemoveSlot;
use App\Modules\Calendar\Actions\UpdateSlot;
use App\Modules\Calendar\Http\Requests\SlotRequest;
use App\Modules\Calendar\Http\Requests\UpdateSlotRequest;
use App\Modules\Calendar\Http\Resources\EventSlotResource;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventSlot;
use Dedoc\Scramble\Attributes\Response as OpenApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Gate;

final class SlotController
{
    #[OpenApiResponse(status: 422, description: 'Недопустимый слот или отменённое событие.', type: "array{message: string, code: 'event.cancelled'|'slot.label_required'|'slot.role_not_ministry'|'slot.role_archived_ministry'}")]
    public function store(SlotRequest $request, Event $event, AddSlot $add): JsonResponse
    {
        Gate::authorize('update', $event);
        /** @var array{label?: string|null, role_id?: string|null, required_count: int} $attributes */
        $attributes = $request->validated();

        return (new EventSlotResource($add->handle($event, $attributes)))->response()->setStatusCode(201);
    }

    #[OpenApiResponse(status: 422, description: 'Недопустимый слот или отменённое событие.', type: "array{message: string, code: 'event.cancelled'|'slot.label_required'|'slot.role_not_ministry'|'slot.role_archived_ministry'}")]
    public function update(UpdateSlotRequest $request, EventSlot $slot, UpdateSlot $update): EventSlotResource
    {
        abort_if($slot->archived_at !== null, 404);
        Gate::authorize('manage', $slot);
        /** @var array{label?: string|null, role_id?: string|null, required_count?: int} $attributes */
        $attributes = $request->validated();

        return new EventSlotResource($update->handle($slot, $attributes));
    }

    #[OpenApiResponse(status: 422, description: 'Слоты отменённого события заморожены.', type: "array{message: string, code: 'event.cancelled'}")]
    public function destroy(EventSlot $slot, RemoveSlot $remove): Response
    {
        abort_if($slot->archived_at !== null, 404);
        Gate::authorize('manage', $slot);
        $remove->handle($slot);

        return response()->noContent();
    }
}
