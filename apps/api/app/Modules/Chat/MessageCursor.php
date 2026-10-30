<?php

declare(strict_types=1);

namespace App\Modules\Chat;

use App\Modules\Chat\Models\Message;
use App\Support\DomainRuleException;
use Carbon\CarbonImmutable;

final class MessageCursor
{
    private const FORMAT = 'Y-m-d\TH:i:s.u\Z';

    public static function encode(Message $message): string
    {
        return $message->created_at->utc()->format(self::FORMAT).'|'.$message->id;
    }

    /** @return array{created_at: CarbonImmutable, id: string} */
    public static function decode(string $cursor): array
    {
        if (! preg_match('/\A((?!0000)\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z)\|([0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25})\z/', $cursor, $parts)) {
            throw DomainRuleException::because('cursor.invalid', 'Неверный курсор.');
        }

        try {
            $createdAt = CarbonImmutable::createFromFormat('!'.self::FORMAT, $parts[1], 'UTC');
            if ($createdAt === null || $createdAt->format(self::FORMAT) !== $parts[1]) {
                throw DomainRuleException::because('cursor.invalid', 'Неверный курсор.');
            }
        } catch (\Throwable) {
            throw DomainRuleException::because('cursor.invalid', 'Неверный курсор.');
        }

        return ['created_at' => $createdAt, 'id' => $parts[2]];
    }
}
