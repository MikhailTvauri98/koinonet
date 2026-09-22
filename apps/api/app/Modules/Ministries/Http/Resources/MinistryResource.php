<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Http\Resources;

use App\Modules\Ministries\Models\Ministry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Ministry */
final class MinistryResource extends JsonResource
{
    /** @return array{id: string, name: string, description: string|null, default_role_id: string|null, archived_at: string|null} */
    public function toArray(Request $request): array
    {
        $ministry = $this->resource;
        assert($ministry instanceof Ministry);

        return [
            'id' => $ministry->id,
            'name' => $ministry->name,
            'description' => $ministry->description,
            'default_role_id' => $ministry->default_role_id,
            'archived_at' => $ministry->archived_at?->toISOString(),
        ];
    }
}
