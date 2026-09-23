<?php

declare(strict_types=1);

namespace App\Modules\Media\Http\Controllers;

use App\Modules\Directory\Models\User;
use App\Modules\Media\Actions\DeleteOwnMedia;
use App\Modules\Media\Actions\StoreMedia;
use App\Modules\Media\Http\Requests\StoreMediaRequest;
use App\Modules\Media\Http\Resources\MediaResource;
use App\Modules\Media\Models\Media;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Response;
use Illuminate\Http\UploadedFile;

final class MediaController
{
    public function store(StoreMediaRequest $request, StoreMedia $storeMedia): JsonResponse
    {
        $file = $request->file('file');
        assert($file instanceof UploadedFile);

        $user = $request->user();
        assert($user instanceof User);

        $media = $storeMedia->handle($file, $user);

        return (new MediaResource($media))->response()->setStatusCode(201);
    }

    public function destroy(Media $media, DeleteOwnMedia $deleteOwnMedia): Response
    {
        $deleteOwnMedia->handle($media);

        return response()->noContent();
    }
}
