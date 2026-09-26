<?php

declare(strict_types=1);

namespace App\Modules\Settings\Http\Resources;

use App\Modules\Settings\ChurchSettings;
use App\Modules\Settings\Models\Setting;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin ChurchSettings */
final class SettingsResource extends JsonResource
{
    public function __construct(private readonly ChurchSettings $settings)
    {
        parent::__construct($settings);
    }

    /**
     * Architecture 8 lists `GET /settings` as returning only "the public
     * part": name and timezone. `phone_region` is written through
     * `PUT /settings` behind `settings.manage` (SettingsPolicy::update) but
     * was never readable at all - task 30's `admin/settings.vue` needs to
     * show the current value before letting its holder change it, so the
     * non-public part is exposed here to whoever can write it, using the
     * same gate as the write side.
     *
     * @return array{church_name: string, timezone: string, phone_region?: string}
     */
    public function toArray(Request $request): array
    {
        return [
            'church_name' => $this->settings->name(),
            'timezone' => $this->settings->timezone(),
            'phone_region' => $this->when(
                Gate::forUser($request->user())->allows('update', Setting::class),
                fn (): string => $this->settings->phoneRegion(),
            ),
        ];
    }
}
