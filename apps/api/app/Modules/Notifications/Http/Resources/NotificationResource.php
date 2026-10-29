<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Carbon;

/**
 * @mixin DatabaseNotification
 *
 * @property-read array{category: string, title: string, body: string, url: string} $data
 * @property-read Carbon|null $read_at
 * @property-read Carbon|null $created_at
 */
final class NotificationResource extends JsonResource
{
    /** @return array{id: string, category: string, title: string, body: string, url: string, read_at: string|null, created_at: string|null} */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'category' => $this->data['category'],
            'title' => $this->data['title'],
            'body' => $this->data['body'],
            'url' => $this->data['url'],
            'read_at' => $this->read_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
