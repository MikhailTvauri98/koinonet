<?php

declare(strict_types=1);

namespace App\Modules\Media\Http\Resources;

use App\Modules\Media\Models\Media;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Media */
final class MediaResource extends JsonResource
{
    /**
     * `url` is part of the settled shape (architecture 7.8) but stays null
     * until task 22 adds the signed retrieval route that fills it in.
     *
     * @return array{id: string, kind: string, status: string, url: string|null}
     */
    public function toArray(Request $request): array
    {
        $media = $this->resource;
        assert($media instanceof Media);

        return [
            'id' => $media->id,
            'kind' => $media->kind->value,
            'status' => $media->status->value,
            'url' => null,
        ];
    }
}
