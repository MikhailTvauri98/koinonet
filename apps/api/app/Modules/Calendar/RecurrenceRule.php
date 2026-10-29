<?php

declare(strict_types=1);

namespace App\Modules\Calendar;

use Carbon\CarbonImmutable;
use InvalidArgumentException;

final readonly class RecurrenceRule
{
    private function __construct(
        public string $type,
        public int $weekday,
        public ?int $nth,
        public ?CarbonImmutable $anchorDate,
    ) {}

    /** @param array<string, mixed>|null $data */
    public static function fromArray(?array $data): ?self
    {
        if ($data === null) {
            return null;
        }
        $type = $data['type'] ?? null;
        $weekday = $data['weekday'] ?? null;
        $keys = match ($type) {
            'weekly' => ['type', 'weekday'],
            'biweekly' => ['type', 'weekday', 'anchor_date'],
            'monthly_nth_weekday' => ['type', 'weekday', 'nth'],
            default => [],
        };
        if ($keys === [] || array_diff(array_keys($data), $keys) !== [] || array_diff($keys, array_keys($data)) !== []
            || ! is_int($weekday) || $weekday < 1 || $weekday > 7) {
            throw new InvalidArgumentException('Неверное правило повторения.');
        }
        $nth = null;
        $anchor = null;
        if ($type === 'monthly_nth_weekday') {
            $nth = $data['nth'];
            if (! is_int($nth) || ! in_array($nth, [-1, 1, 2, 3, 4, 5], true)) {
                throw new InvalidArgumentException('Порядковый номер должен быть от 1 до 5 или −1.');
            }
        }
        if ($type === 'biweekly') {
            $date = $data['anchor_date'];
            if (! is_string($date) || ! preg_match('/\A(\d{4})-(\d{2})-(\d{2})\z/', $date, $parts)
                || ! checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])) {
                throw new InvalidArgumentException('Укажите опорную дату в формате ГГГГ-ММ-ДД.');
            }
            // A calendar date, deliberately independent of the application/Church timezone.
            $anchor = CarbonImmutable::createFromFormat('!Y-m-d', $date, 'UTC');
        }

        return new self($type, $weekday, $nth, $anchor);
    }

    /** @return array{type: string, weekday: int, nth?: int, anchor_date?: string} */
    public function toArray(): array
    {
        $data = ['type' => $this->type, 'weekday' => $this->weekday];
        if ($this->nth !== null) {
            $data['nth'] = $this->nth;
        }
        if ($this->anchorDate !== null) {
            $data['anchor_date'] = $this->anchorDate->toDateString();
        }

        return $data;
    }

    /** @return list<CarbonImmutable> */
    public function occurrencesBetween(CarbonImmutable $from, CarbonImmutable $to): array
    {
        $from = $from->startOfDay();
        $to = CarbonImmutable::createFromFormat('!Y-m-d', $to->toDateString(), $from->timezone);
        $anchor = $this->anchorDate === null ? null
            : CarbonImmutable::createFromFormat('!Y-m-d', $this->anchorDate->toDateString(), $from->timezone);
        if ($anchor !== null) {
            $anchor = $anchor->addDays(($this->weekday - $anchor->isoWeekday() + 7) % 7);
            // Compare calendar dates in UTC, so a DST hour never changes the phase.
            $anchor = CarbonImmutable::createFromFormat('!Y-m-d', $anchor->toDateString(), 'UTC');
        }
        $dates = [];
        for ($date = $from; $date <= $to; $date = $date->addDay()) {
            if ($date->isoWeekday() !== $this->weekday) {
                continue;
            }
            if ($anchor !== null) {
                $calendarDate = CarbonImmutable::createFromFormat('!Y-m-d', $date->toDateString(), 'UTC');
                if ((int) $anchor->diff($calendarDate)->format('%r%a') % 14 !== 0) {
                    continue;
                }
            }
            if ($this->type === 'monthly_nth_weekday') {
                $matches = $this->nth === -1
                    ? $date->addWeek()->month !== $date->month
                    : intdiv($date->day - 1, 7) + 1 === $this->nth;
                if (! $matches) {
                    continue;
                }
            }
            $dates[] = $date;
        }

        return $dates;
    }
}
