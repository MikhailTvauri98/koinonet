<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Controllers;

use App\Modules\Calendar\Actions\CreateEvent;
use App\Modules\Calendar\Actions\UpdateEvent;
use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\Http\Requests\StoreEventRequest;
use App\Modules\Calendar\Http\Requests\UpdateEventRequest;
use App\Modules\Calendar\Http\Resources\EventResource;
use App\Modules\Calendar\Models\Event;
use App\Modules\Directory\Models\User;
use Dedoc\Scramble\Attributes\Response as OpenApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

final class EventController
{
    public function show(Event $event): EventResource
    {
        Gate::authorize('view', $event);

        return new EventResource($event);
    }

    #[OpenApiResponse(status: 422, description: 'Недопустимый слот.', type: "array{message: string, code: 'slot.label_required'|'slot.role_not_ministry'}")]
    public function store(StoreEventRequest $request, CreateEvent $create): JsonResponse
    {
        /** @var array{owner_type: string, ministry_id?: string|null, title: string, description?: string|null, location?: string|null, starts_at: string, ends_at: string, visibility: string, slots?: list<array{label?: string|null, role_id?: string|null, required_count: int}>, notify?: string} $attributes */
        $attributes = $request->validated();
        Gate::authorize('create', [Event::class, EventOwnerType::from($attributes['owner_type']), $attributes['ministry_id'] ?? null]);
        $user = $request->user();
        assert($user instanceof User);

        return (new EventResource($create->handle($user, $attributes)))->response()->setStatusCode(201);
    }

    #[OpenApiResponse(status: 422, description: 'Время отменённого события изменить нельзя.', type: "array{message: string, code: 'event.cancelled'}")]
    public function update(UpdateEventRequest $request, Event $event, UpdateEvent $update): EventResource
    {
        Gate::authorize('update', $event);
        /** @var array{title?: string, description?: string|null, location?: string|null, starts_at?: string, ends_at?: string, visibility?: string} $attributes */
        $attributes = $request->validated();

        return new EventResource($update->handle($event, $attributes));
    }
}
