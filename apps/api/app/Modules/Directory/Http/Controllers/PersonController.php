<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Controllers;

use App\Modules\Directory\Actions\ArchivePerson;
use App\Modules\Directory\Actions\CreatePerson;
use App\Modules\Directory\Actions\RestorePerson;
use App\Modules\Directory\Actions\UpdatePerson;
use App\Modules\Directory\Http\Queries\PersonIndexQuery;
use App\Modules\Directory\Http\Requests\StorePersonRequest;
use App\Modules\Directory\Http\Requests\UpdatePersonRequest;
use App\Modules\Directory\Http\Resources\PersonResource;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\PersonStatus;
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

        /** @var array{search?: string, status?: string, archived?: bool|string|int, without_roles?: bool|string|int, per_page?: int} $validated */
        $validated = $request->validate([
            'search' => ['sometimes', 'string', 'max:200'],
            'status' => ['sometimes', Rule::enum(PersonStatus::class)],
            'archived' => ['sometimes', 'boolean'],
            'without_roles' => ['sometimes', 'boolean'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $filters = [
            ...$validated,
            'archived' => $request->boolean('archived'),
            'without_roles' => $request->boolean('without_roles'),
            'per_page' => (int) ($validated['per_page'] ?? 25),
        ];

        return PersonResource::collection($query->paginate($filters));
    }

    public function store(StorePersonRequest $request, CreatePerson $createPerson): JsonResponse
    {
        Gate::authorize('create', Person::class);

        /** @var array<string, mixed> $attributes */
        $attributes = $request->validated();
        $result = $createPerson->handle($attributes);

        return (new PersonResource($this->withFlags($result['person'])))
            ->additional(['warnings' => $result['warnings']])
            ->response()
            ->setStatusCode(201);
    }

    public function show(Person $person): PersonResource
    {
        Gate::authorize('view', $person);

        return new PersonResource($this->withFlags($person));
    }

    public function update(
        UpdatePersonRequest $request,
        Person $person,
        UpdatePerson $updatePerson,
    ): PersonResource {
        Gate::authorize('update', $person);

        /** @var array<string, mixed> $attributes */
        $attributes = $request->validated();

        return new PersonResource($this->withFlags($updatePerson->handle($person, $attributes)));
    }

    public function archive(Person $person, ArchivePerson $archivePerson): PersonResource
    {
        Gate::authorize('archive', $person);

        return new PersonResource($this->withFlags($archivePerson->handle($person)));
    }

    public function restore(Person $person, RestorePerson $restorePerson): PersonResource
    {
        Gate::authorize('restore', $person);

        return new PersonResource($this->withFlags($restorePerson->handle($person)));
    }

    private function withFlags(Person $person): Person
    {
        return $person->loadExists(['user', 'globalRoles']);
    }
}
