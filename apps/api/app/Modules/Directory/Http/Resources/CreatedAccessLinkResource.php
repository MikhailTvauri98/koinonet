<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Resources;

use App\Modules\Directory\Models\AccessLink;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin AccessLink */
final class CreatedAccessLinkResource extends JsonResource
{
    public function __construct(AccessLink $resource, private readonly string $url)
    {
        parent::__construct($resource);
    }

    /** @return array{url: string, expires_at: string} */
    public function toArray(Request $request): array
    {
        $link = $this->resource;
        assert($link instanceof AccessLink);

        return [
            'url' => $this->url,
            'expires_at' => $link->expires_at->toISOString(),
        ];
    }
}
