<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Controllers;

use App\Modules\Directory\Actions\SetPersonPhoto;
use App\Modules\Directory\Actions\UpdateOwnLogin;
use App\Modules\Directory\Actions\UpdateOwnPassword;
use App\Modules\Directory\Actions\UpdateOwnProfile;
use App\Modules\Directory\Http\Requests\SetPhotoRequest;
use App\Modules\Directory\Http\Requests\UpdateLoginRequest;
use App\Modules\Directory\Http\Requests\UpdatePasswordRequest;
use App\Modules\Directory\Http\Requests\UpdateProfileRequest;
use App\Modules\Directory\Http\Resources\MeResource;
use App\Modules\Directory\Http\Resources\MyProfileResource;
use App\Modules\Directory\Http\Resources\PersonResource;
use App\Modules\Directory\Models\User;
use App\Modules\Media\Models\Media;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class ProfileController
{
    /**
     * Task 30 addition (brief defect, see {@see MyProfileResource}): the
     * plan never listed a "read" counterpart to `update` below, but
     * `settings/profile.vue` has to load the contacts and the
     * `contacts_public` flag it edits from somewhere.
     */
    public function show(Request $request): MyProfileResource
    {
        $user = $request->user();
        assert($user instanceof User);

        return new MyProfileResource($user->person);
    }

    public function update(UpdateProfileRequest $request, UpdateOwnProfile $updateOwnProfile): PersonResource
    {
        $user = $request->user();
        assert($user instanceof User);

        /** @var array<string, mixed> $attributes */
        $attributes = $request->validated();
        $person = $updateOwnProfile->handle($user->person, $attributes);

        return new PersonResource($person->loadCardFlags());
    }

    public function updatePhoto(SetPhotoRequest $request, SetPersonPhoto $setPersonPhoto): PersonResource
    {
        $user = $request->user();
        assert($user instanceof User);

        $media = Media::query()->findOrFail($request->string('media_id')->toString());
        $person = $setPersonPhoto->handle($user->person, $media);

        return new PersonResource($person->loadCardFlags());
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
