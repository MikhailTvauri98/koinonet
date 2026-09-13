<?php

declare(strict_types=1);

namespace App\Modules\Settings\Actions;

use App\Modules\Settings\ChurchSettings;
use App\Modules\Settings\Models\Setting;
use Illuminate\Support\Facades\Cache;
use InvalidArgumentException;

final class PutChurchSettings
{
    /** @param array<string, mixed> $values */
    public function execute(array $values): void
    {
        foreach (array_keys($values) as $key) {
            if (! array_key_exists($key, ChurchSettings::DEFAULTS)) {
                throw new InvalidArgumentException("Неизвестная настройка: {$key}");
            }
        }

        foreach ($values as $key => $value) {
            Setting::query()->updateOrCreate(
                ['key' => $key],
                ['value' => $value, 'updated_at' => now()],
            );
        }

        Cache::forget('settings');
    }
}
