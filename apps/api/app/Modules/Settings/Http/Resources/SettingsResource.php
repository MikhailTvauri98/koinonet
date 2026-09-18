<?php

declare(strict_types=1);

namespace App\Modules\Settings\Http\Resources;

use App\Modules\Settings\ChurchSettings;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin ChurchSettings */
final class SettingsResource extends JsonResource
{
    public function __construct(private readonly ChurchSettings $settings)
    {
        parent::__construct($settings);
    }

    /** @return array{church_name: string, timezone: string} */
    public function toArray(Request $request): array
    {
        return [
            'church_name' => $this->settings->name(),
            'timezone' => $this->settings->timezone(),
        ];
    }
}
