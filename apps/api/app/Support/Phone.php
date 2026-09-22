<?php

declare(strict_types=1);

namespace App\Support;

use App\Modules\Settings\ChurchSettings;
use libphonenumber\NumberParseException;
use libphonenumber\PhoneNumberFormat;
use libphonenumber\PhoneNumberUtil;

final class Phone
{
    /** @param string|null $region defaults to the church phone region from settings */
    public static function normalize(?string $raw, ?string $region = null): ?string
    {
        if ($raw === null || trim($raw) === '') {
            return null;
        }

        $util = PhoneNumberUtil::getInstance();
        $region ??= app(ChurchSettings::class)->phoneRegion();

        try {
            $parsed = $util->parse($raw, $region);
        } catch (NumberParseException) {
            throw DomainRuleException::because('phone.invalid', 'Не удалось разобрать номер телефона.');
        }

        if (! $util->isValidNumber($parsed)) {
            throw DomainRuleException::because('phone.invalid', 'Номер телефона выглядит неверным.');
        }

        return $util->format($parsed, PhoneNumberFormat::E164);
    }
}
