<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

use Carbon\CarbonInterval;

enum ReminderKind: string
{
    case H24 = 'h24';
    case H2 = 'h2';

    public function offset(): CarbonInterval
    {
        return match ($this) {
            self::H24 => CarbonInterval::hours(24),
            self::H2 => CarbonInterval::hours(2),
        };
    }

    public function label(): string
    {
        return match ($this) {
            self::H24 => 'за сутки',
            self::H2 => 'за два часа',
        };
    }
}
