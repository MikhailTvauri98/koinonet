<?php

declare(strict_types=1);

namespace App\Modules\Settings\Http\Controllers;

use App\Modules\Access\AuditLogger;
use App\Modules\Settings\ChurchSettings;
use App\Modules\Settings\Http\Requests\UpdateSettingsRequest;
use App\Modules\Settings\Http\Resources\SettingsResource;
use App\Modules\Settings\Models\Setting;
use Illuminate\Support\Facades\Gate;

final readonly class SettingsController
{
    private const array KEYS = [
        'church_name' => 'church.name',
        'timezone' => 'church.timezone',
        'phone_region' => 'church.phone_region',
    ];

    public function __construct(
        private ChurchSettings $settings,
        private AuditLogger $audit,
    ) {}

    public function index(): SettingsResource
    {
        return new SettingsResource($this->settings);
    }

    public function update(UpdateSettingsRequest $request): SettingsResource
    {
        Gate::authorize('update', Setting::class);

        /** @var array{church_name?: string, timezone?: string, phone_region?: string} $validated */
        $validated = $request->validated();
        $before = $this->snapshot();
        $values = [];

        foreach ($validated as $key => $value) {
            $values[self::KEYS[$key]] = $value;
        }

        $this->settings->put($values);
        $this->audit->record('settings.changed', null, [
            'before' => $before,
            'after' => $this->snapshot(),
        ]);

        return new SettingsResource($this->settings);
    }

    /** @return array{church_name: string, timezone: string, phone_region: string} */
    private function snapshot(): array
    {
        return [
            'church_name' => $this->settings->name(),
            'timezone' => $this->settings->timezone(),
            'phone_region' => $this->settings->phoneRegion(),
        ];
    }
}
