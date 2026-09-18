<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Resources;

use App\Modules\Directory\Models\AccessLink;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AccessLink */
final class AccessLinkResource extends JsonResource
{
    /** @return array{kind: string, person: array{first_name: string, last_name: string}, login_hint: array{phone: string|null, email: string|null}} */
    public function toArray(Request $request): array
    {
        $link = $this->resource;
        assert($link instanceof AccessLink);

        return [
            'kind' => $link->kind->value,
            'person' => [
                'first_name' => $link->person->first_name,
                'last_name' => $link->person->last_name,
            ],
            'login_hint' => [
                'phone' => $link->person->phone,
                'email' => $link->person->email,
            ],
        ];
    }
}
