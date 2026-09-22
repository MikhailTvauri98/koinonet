<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Controllers;

use App\Modules\Directory\Actions\UpdateOwnLogin;
use App\Modules\Directory\Actions\UpdateOwnPassword;
use App\Modules\Directory\Actions\UpdateOwnProfile;
use App\Modules\Directory\Http\Requests\UpdateLoginRequest;
use App\Modules\Directory\Http\Requests\UpdatePasswordRequest;
use App\Modules\Directory\Http\Requests\UpdateProfileRequest;
use App\Modules\Directory\Http\Resources\MeResource;
use App\Modules\Directory\Http\Resources\PersonResource;
use App\Modules\Directory\Models\User;
use Illuminate\Http\JsonResponse;

final class ProfileController
{
    public function update(UpdateProfileRequest $request, UpdateOwnProfile $updateOwnProfile): PersonResource
    {
        $user = $request->user();
        assert($user instanceof User);

        /** @var array<string, mixed> $attributes */
        $attributes = $request->validated();
        $person = $updateOwnProfile->handle($user->person, $attributes);

        return new PersonResource($person->loadExists(['user', 'globalRoles']));
    }

    public function updateLogin(UpdateLoginRequest $request, UpdateOwnLogin $updateOwnLogin): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        $updateOwnLogin->handle(
            $user,
            $request->string('login')->toString(),
            $request->string('current_password')->toString(),
        );

        return (new MeResource($user->load('person')))->response();
    }

    public function updatePassword(
        UpdatePasswordRequest $request,
        UpdateOwnPassword $updateOwnPassword,
    ): JsonResponse {
        $user = $request->user();
        assert($user instanceof User);

        $updateOwnPassword->handle(
            $user,
            $request->string('current_password')->toString(),
            $request->string('password')->toString(),
            $request->session()->getId(),
        );

        return (new MeResource($user->load('person')))->response();
    }
}
