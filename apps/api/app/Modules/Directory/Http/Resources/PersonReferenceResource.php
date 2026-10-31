<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Resources;

use App\Modules\Directory\Models\Person;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Person */
final class PersonReferenceResource extends JsonResource
{
    /** @return array{id: string} */
    public function toArray(Request $request): array
    {
        return ['id' => $this->id];
    }
}
