<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Controllers;

use App\Modules\Directory\Actions\ArchivePerson;
use App\Modules\Directory\Actions\CreatePerson;
use App\Modules\Directory\Actions\RestorePerson;
use App\Modules\Directory\Actions\SetPersonPhoto;
use App\Modules\Directory\Actions\UpdatePerson;
use App\Modules\Directory\Http\Queries\PersonIndexQuery;
use App\Modules\Directory\Http\Requests\SetPhotoRequest;
use App\Modules\Directory\Http\Requests\StorePersonRequest;
use App\Modules\Directory\Http\Requests\UpdatePersonRequest;
use App\Modules\Directory\Http\Resources\PersonReferenceResource;
use App\Modules\Directory\Http\Resources\PersonResource;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Directory\PersonStatus;
use App\Modules\Media\Models\Media;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;

final class PersonController
{
    public function index(Request $request, PersonIndexQuery $query): AnonymousResourceCollection
    {
        Gate::authorize('viewAny', Person::class);

        /** @var array{search?: string, status?: string, ministry?: string, archived?: bool|string|int, without_roles?: bool|string|int, has_account?: bool|string|int, per_page?: int} $validated */
        $validated = $request->validate([
            'search' => ['sometimes', 'string', 'max:200'],
            'status' => ['sometimes', Rule::enum(PersonStatus::class)],
            'ministry' => ['sometimes', 'string', 'ulid'],
            'archived' => ['sometimes', 'boolean'],
            'without_roles' => ['sometimes', 'boolean'],
            'has_account' => ['sometimes', 'boolean'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $filters = [
            ...$validated,
            'archived' => $request->boolean('archived'),
            'without_roles' => $request->boolean('without_roles'),
            'per_page' => (int) ($validated['per_page'] ?? 25),
            ...($request->has('has_account') ? ['has_account' => $request->boolean('has_account')] : []),
        ];

        $viewer = $request->user();
        assert($viewer instanceof User);

        return PersonResource::collection($query->paginate($filters, $viewer));
    }

    public function store(StorePersonRequest $request, CreatePerson $createPerson): JsonResponse
    {
        Gate::authorize('create', Person::class);

        /** @var array<string, mixed> $attributes */
        $attributes = $request->validated();
        $result = $createPerson->handle($attributes);

        return response()->json([
            'data' => PersonResource::forMutation($result['person']),
            'warnings' => $result['warnings'],
        ], 201);
    }

    public function show(Person $person): PersonResource
    {
        Gate::authorize('view', $person);

        return new PersonResource($this->withFlags($person)->load([
            'globalRoles', 'ministryMemberships.ministry',
        ]));
    }

    public function update(
        UpdatePersonRequest $request,
        Person $person,
        UpdatePerson $updatePerson,
    ): PersonResource|PersonReferenceResource {
        Gate::authorize('update', $person);

        /** @var array<string, mixed> $attributes */
        $attributes = $request->validated();

        return PersonResource::forMutation($updatePerson->handle($person, $attributes));
    }

    public function archive(Person $person, ArchivePerson $archivePerson): PersonResource|PersonReferenceResource
    {
        Gate::authorize('archive', $person);

        return PersonResource::forMutation($archivePerson->handle($person));
    }

    public function restore(Person $person, RestorePerson $restorePerson): PersonResource|PersonReferenceResource
    {
        Gate::authorize('restore', $person);

        return PersonResource::forMutation($restorePerson->handle($person));
    }

    public function updatePhoto(
        SetPhotoRequest $request,
        Person $person,
        SetPersonPhoto $setPersonPhoto,
    ): PersonResource|PersonReferenceResource {
        Gate::authorize('update', $person);

        $media = Media::query()->findOrFail($request->string('media_id')->toString());

        return PersonResource::forMutation($setPersonPhoto->handle($person, $media));
    }

    private function withFlags(Person $person): Person
    {
        return $person->loadCardFlags();
    }
}
