<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Http\Resources;

use App\Modules\Chat\Models\Chat;
use App\Modules\Media\SignedMediaUrl;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Ministry */
final class MinistryResource extends JsonResource
{
    /**
     * @return array{
     *     id: string,
     *     name: string,
     *     description: string|null,
     *     cover_url: string|null,
     *     default_role_id: string|null,
     *     chat_id: string|null,
     *     archived_at: string|null
     * }
     */
    public function toArray(Request $request): array
    {
        $ministry = $this->resource;
        assert($ministry instanceof Ministry);
        $chatId = Chat::query()->where('ministry_id', $ministry->id)->value('id');

        return [
            'id' => $ministry->id,
            'name' => $ministry->name,
            'description' => $ministry->description,
            // `large` (1080px), not `thumb` (320px, architecture 7.8 defines
            // both sizes but not which screen uses which): unlike a
            // person's photo or a member row's avatar, a ministry cover is
            // shown banner-style at close to full card width, and
            // a 320px source would visibly blur stretched that wide.
            'cover_url' => SignedMediaUrl::variant($ministry->cover, 'large'),
            'default_role_id' => $ministry->default_role_id,
            'chat_id' => $chatId === null ? null : (string) $chatId,
            'archived_at' => $ministry->archived_at?->toISOString(),
        ];
    }
}
