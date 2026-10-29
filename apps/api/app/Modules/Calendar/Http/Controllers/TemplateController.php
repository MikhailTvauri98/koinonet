<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Controllers;

use App\Modules\Calendar\Actions\ArchiveTemplate;
use App\Modules\Calendar\Actions\CreateEventFromTemplate;
use App\Modules\Calendar\Actions\CreateTemplate;
use App\Modules\Calendar\Actions\UpdateTemplate;
use App\Modules\Calendar\EventAccess;
use App\Modules\Calendar\EventOwnerType;
use App\Modules\Calendar\Http\Requests\CreateEventFromTemplateRequest;
use App\Modules\Calendar\Http\Requests\IndexTemplateRequest;
use App\Modules\Calendar\Http\Requests\TemplateRequest;
use App\Modules\Calendar\Http\Requests\UpdateTemplateRequest;
use App\Modules\Calendar\Http\Resources\EventResource;
use App\Modules\Calendar\Http\Resources\EventTemplateResource;
use App\Modules\Calendar\Models\EventTemplate;
use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;
use Dedoc\Scramble\Attributes\QueryParameter;
use Dedoc\Scramble\Attributes\Response as OpenApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

final class TemplateController
{
    #[QueryParameter('scope', description: 'church — все видимые шаблоны; ministry:{id} — только шаблоны служения.', default: 'church')]
    #[QueryParameter('archived', description: 'Включить архивные шаблоны, доступные управляющим.', default: false)]
    public function index(IndexTemplateRequest $request, EventAccess $access): AnonymousResourceCollection
    {
        $viewer = $request->user();
        assert($viewer instanceof User);
        $query = $access->constrainVisibleTemplatesQuery(EventTemplate::query(), $viewer);
        if (! $request->boolean('archived')) {
            $query->whereNull('archived_at');
        }
        $scope = $request->string('scope', 'church')->toString();
        if (str_starts_with($scope, 'ministry:')) {
            $query->where('owner_type', EventOwnerType::Ministry)->where('ministry_id', substr($scope, 9));
        }

        return EventTemplateResource::collection($query->with(['ministry', 'slots' => fn ($slots) => $slots->whereNull('archived_at'), 'slots.role'])->orderBy('title')->orderBy('id')->get());
    }

    public function show(EventTemplate $template): EventTemplateResource
    {
        Gate::authorize('view', $template);

        return new EventTemplateResource($template);
    }

    #[OpenApiResponse(status: 422, description: 'Недопустимый слот.', type: "array{message: string, code: 'slot.label_required'|'slot.role_not_ministry'|'slot.role_archived_ministry'}")]
    public function store(TemplateRequest $request, CreateTemplate $create): JsonResponse
    {
        /** @var array{owner_type: string, ministry_id?: string|null, title: string, description?: string|null, location?: string|null, visibility: string, start_time: string, duration_minutes: int, recurrence?: array<string, mixed>|null, active?: bool, slots?: list<array{label?: string|null, role_id?: string|null, required_count: int}>} $attributes */
        $attributes = $request->validated();
        Gate::authorize('create', [EventTemplate::class, EventOwnerType::from($attributes['owner_type']), $attributes['ministry_id'] ?? null]);
        $creator = $request->user();
        assert($creator instanceof User);

        return (new EventTemplateResource($create->handle($creator, $attributes)))->response()->setStatusCode(201);
    }

    #[OpenApiResponse(status: 422, description: 'Архивный шаблон или недопустимый слот.', type: "array{message: string, code: 'template.archived'|'slot.label_required'|'slot.role_not_ministry'|'slot.role_archived_ministry'}")]
    public function update(UpdateTemplateRequest $request, EventTemplate $template, UpdateTemplate $update): EventTemplateResource
    {
        Gate::authorize('update', $template);
        /** @var array{title?: string, description?: string|null, location?: string|null, visibility?: string, start_time?: string, duration_minutes?: int, recurrence?: array<string, mixed>|null, active?: bool, slots?: list<array{label?: string|null, role_id?: string|null, required_count: int}>} $attributes */
        $attributes = $request->validated();

        return new EventTemplateResource($update->handle($template, $attributes));
    }

    public function archive(EventTemplate $template, ArchiveTemplate $archive): EventTemplateResource
    {
        Gate::authorize('update', $template);

        return new EventTemplateResource($archive->handle($template));
    }

    #[OpenApiResponse(status: 422, description: 'Событие на эту дату уже создано, шаблон или служение архивированы.', type: "array{message: string, code: 'event.occurrence_exists'|'template.archived'|'ministry.archived'}")]
    public function createEvent(CreateEventFromTemplateRequest $request, EventTemplate $template, CreateEventFromTemplate $create): JsonResponse
    {
        Gate::authorize('update', $template);
        $creator = $request->user();
        assert($creator instanceof User);
        $date = CarbonImmutable::createFromFormat('!Y-m-d', $request->string('date')->toString(), 'UTC');

        return (new EventResource($create->handle($template, $date, $creator)))->response()->setStatusCode(201);
    }
}
