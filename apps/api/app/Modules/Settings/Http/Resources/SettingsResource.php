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
     * The public part - name, timezone and public delivery keys - for every account (architecture
     * 8). `phone_region` is added for whoever may change it through
     * `PUT /settings` (`settings.manage`, the same SettingsPolicy::update
     * gate as the write side), so the settings screen can show the current
     * value before it is changed.
     *
     * @return array{church_name: string, timezone: string, reverb_key: string, vapid_public_key: string, phone_region?: string}
     */
    public function toArray(Request $request): array
    {
        return [
            'church_name' => $this->settings->name(),
            'timezone' => $this->settings->timezone(),
            'reverb_key' => (string) config('broadcasting.connections.reverb.key'),
            'vapid_public_key' => (string) config('webpush.vapid.public_key'),
            'phone_region' => $this->when(
                Gate::forUser($request->user())->allows('update', Setting::class),
                fn (): string => $this->settings->phoneRegion(),
            ),
        ];
    }
}
