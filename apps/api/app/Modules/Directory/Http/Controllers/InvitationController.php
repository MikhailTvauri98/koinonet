<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Controllers;

use App\Modules\Directory\Actions\CreateInvitation;
use App\Modules\Directory\Actions\CreatePasswordResetLink;
use App\Modules\Directory\Actions\DisableUser;
use App\Modules\Directory\Actions\EnableUser;
use App\Modules\Directory\Http\Resources\CreatedAccessLinkResource;
use App\Modules\Directory\Http\Resources\PersonResource;
use App\Modules\Directory\Models\Person;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Gate;

final class InvitationController
{
    public function invite(Person $person, CreateInvitation $createInvitation): JsonResponse
    {
        Gate::authorize('invite', $person);
        $result = $createInvitation->handle($person);

        return (new CreatedAccessLinkResource($result['link'], $result['url']))
            ->response()
            ->setStatusCode(201);
    }

    public function passwordReset(
        Person $person,
        CreatePasswordResetLink $createPasswordResetLink,
    ): JsonResponse {
        Gate::authorize('createPasswordResetLink', $person);
        $result = $createPasswordResetLink->handle($person);

        return (new CreatedAccessLinkResource($result['link'], $result['url']))
            ->response()
            ->setStatusCode(201);
    }

    public function disable(Person $person, DisableUser $disableUser): PersonResource
    {
        Gate::authorize('disable', $person);
        $disableUser->handle($person);

        return new PersonResource($person->loadCardFlags());
    }

    public function enable(Person $person, EnableUser $enableUser): PersonResource
    {
        Gate::authorize('enable', $person);
        $enableUser->handle($person);

        return new PersonResource($person->loadCardFlags());
    }
}
