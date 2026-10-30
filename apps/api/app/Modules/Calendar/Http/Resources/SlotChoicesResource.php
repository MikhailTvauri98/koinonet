<?php

declare(strict_types=1);

namespace App\Modules\Calendar\Http\Resources;

use App\Modules\Ministries\Models\Ministry;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Ministry */
final class SlotChoicesResource extends JsonResource
{
    /** @return array{id: string, name: string, roles: list<array{id: string, name: string}>} */
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'name' => $this->name, 'roles' => $this->roles->map(fn ($role): array => ['id' => $role->id, 'name' => $role->name])->all()];
    }
}
