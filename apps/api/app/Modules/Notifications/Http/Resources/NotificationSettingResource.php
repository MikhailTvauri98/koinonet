<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class NotificationSettingResource extends JsonResource
{
    /** @return array{category: string, label: string, enabled: bool} */
    public function toArray(Request $request): array
    {
        return [
            'category' => (string) $this->resource['category'],
            'label' => (string) $this->resource['label'],
            'enabled' => (bool) $this->resource['enabled'],
        ];
    }
}
