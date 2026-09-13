<?php

declare(strict_types=1);

namespace App\Modules\Settings;

use App\Modules\Settings\Actions\PutChurchSettings;
use App\Modules\Settings\Models\Setting;
use Illuminate\Support\Facades\Cache;

final class ChurchSettings
{
    /** @var array<string, mixed> */
    public const DEFAULTS = [
        'church.name' => 'Церковь',
        'church.timezone' => 'UTC',
        'church.phone_region' => 'RU',
        'calendar.horizon_weeks' => 8,
        'calendar.reminder_offsets' => ['h24', 'h2'],
    ];

    public function __construct(private readonly PutChurchSettings $putSettings) {}

    public function name(): string
    {
        return (string) $this->all()['church.name'];
    }

    public function timezone(): string
    {
        return (string) $this->all()['church.timezone'];
    }

    public function phoneRegion(): string
    {
        return (string) $this->all()['church.phone_region'];
    }

    /** @return array<string, mixed> */
    public function all(): array
    {
        $stored = Cache::rememberForever(
            'settings',
            fn (): array => Setting::query()->pluck('value', 'key')->all(),
        );

        return [...self::DEFAULTS, ...$stored];
    }

    /** @param array<string, mixed> $values */
    public function put(array $values): void
    {
        $this->putSettings->execute($values);
    }
}
