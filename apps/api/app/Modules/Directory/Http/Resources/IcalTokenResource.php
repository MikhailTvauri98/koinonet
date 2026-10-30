<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Resources;

use App\Modules\Directory\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
final class IcalTokenResource extends JsonResource
{
    /** @return array{ical_url: string} */
    public function toArray(Request $request): array
    {
        $user = $this->resource;
        assert($user instanceof User);

        return ['ical_url' => $user->icalUrl()];
    }
}
