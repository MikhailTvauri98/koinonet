<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Http\Controllers;

use App\Modules\Media\Models\Media;
use App\Modules\Ministries\Actions\ArchiveMinistry;
use App\Modules\Ministries\Actions\CreateMinistry;
use App\Modules\Ministries\Actions\SetMinistryCover;
use App\Modules\Ministries\Actions\UpdateMinistry;
use App\Modules\Ministries\Http\Requests\MinistryRequest;
use App\Modules\Ministries\Http\Requests\SetCoverRequest;
use App\Modules\Ministries\Http\Resources\MinistryResource;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;

final class MinistryController
{
    public function index(Request $request): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Ministry::class);

        $personId = $request->user()?->person_id;

        $ministries = Ministry::query()
            ->whereNull('archived_at')
            ->with('cover')
            ->unless(
                Gate::allows('viewAll', Ministry::class),
                fn (Builder $query): Builder => $query->whereHas(
                    'members',
                    fn (Builder $members): Builder => $members->where('person_id', $personId),
                ),
            )
            ->orderBy('name')
            ->get();

        return MinistryResource::collection($ministries);
    }

    public function store(MinistryRequest $request, CreateMinistry $createMinistry): JsonResponse
    {
        Gate::authorize('create', Ministry::class);

        /** @var array{name: string, description?: string|null} $validated */
        $validated = $request->validated();

        $ministry = $createMinistry->handle($validated['name'], $validated['description'] ?? null);

        return (new MinistryResource($ministry))->response()->setStatusCode(201);
    }

    public function show(Ministry $ministry): MinistryResource
    {
        Gate::authorize('view', $ministry);

        return new MinistryResource($ministry);
    }

    public function update(
        MinistryRequest $request,
        Ministry $ministry,
        UpdateMinistry $updateMinistry,
    ): MinistryResource {
        /** @var array{name?: string, description?: string|null, default_role_id?: string} $validated */
        $validated = $request->validated();

        // Каждое поле требует своего права: название и описание —
        // ministry.edit, роль по умолчанию — roles.manage
        // (docs/architecture.md 6.1). Запрос с обоими типами полей требует
        // оба права, а не хотя бы одно; пустой запрос (ни одного из полей)
        // требует ministry.edit.
        $touchesGeneralFields = array_key_exists('name', $validated) || array_key_exists('description', $validated);
        $touchesDefaultRole = array_key_exists('default_role_id', $validated);

        if ($touchesGeneralFields || ! $touchesDefaultRole) {
            Gate::authorize('update', $ministry);
        }
        if ($touchesDefaultRole) {
            Gate::authorize('changeDefaultRole', $ministry);
        }

        return new MinistryResource($updateMinistry->handle($ministry, $validated));
    }

    public function archive(Ministry $ministry, ArchiveMinistry $archiveMinistry): MinistryResource
    {
        Gate::authorize('archive', $ministry);

        return new MinistryResource($archiveMinistry->handle($ministry));
    }

    public function updateCover(
        SetCoverRequest $request,
        Ministry $ministry,
        SetMinistryCover $setMinistryCover,
    ): MinistryResource {
        Gate::authorize('update', $ministry);

        $media = Media::query()->findOrFail($request->string('media_id')->toString());

        return new MinistryResource($setMinistryCover->handle($ministry, $media));
    }
}
