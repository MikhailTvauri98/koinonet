<?php

declare(strict_types=1);

use App\Modules\Calendar\RecurrenceRule;
use Carbon\CarbonImmutable;

/** @param array<string, mixed> $rule
 * @return list<string>
 */
function recurrenceDates(array $rule, string $from, string $to, string $timezone = 'UTC'): array
{
    return array_map(
        fn (CarbonImmutable $date): string => $date->toDateString(),
        RecurrenceRule::fromArray($rule)->occurrencesBetween(
            CarbonImmutable::parse($from, $timezone), CarbonImmutable::parse($to, $timezone),
        ),
    );
}

it('lists weekly dates including both boundaries', function () {
    expect(recurrenceDates(['type' => 'weekly', 'weekday' => 7], '2026-11-01', '2026-11-29'))
        ->toBe(['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-22', '2026-11-29']);
});

it('keeps the biweekly phase from an old anchor', function (string $anchor, array $expected) {
    expect(recurrenceDates(['type' => 'biweekly', 'weekday' => 6, 'anchor_date' => $anchor], '2026-11-01', '2026-11-30'))
        ->toBe($expected);
})->with([
    ['2026-10-03', ['2026-11-14', '2026-11-28']],
    ['2020-01-04', ['2026-11-14', '2026-11-28']],
]);

it('normalizes the anchor forward to the required weekday as a phase reference', function () {
    expect(recurrenceDates(['type' => 'biweekly', 'weekday' => 6, 'anchor_date' => '2026-10-04'], '2026-11-01', '2026-11-30'))
        ->toBe(['2026-11-07', '2026-11-21'])
        ->and(recurrenceDates(['type' => 'biweekly', 'weekday' => 6, 'anchor_date' => '2026-12-06'], '2026-11-01', '2026-11-30'))
        ->toBe(['2026-11-14', '2026-11-28']);
});

it('keeps biweekly calendar dates across DST and UTC date casts in either timezone direction', function (string $timezone) {
    expect(recurrenceDates(['type' => 'biweekly', 'weekday' => 7, 'anchor_date' => '2026-10-04'], '2026-10-01', '2026-11-02', $timezone))
        ->toBe(['2026-10-04', '2026-10-18', '2026-11-01']);
})->with(['Europe/Warsaw', 'America/New_York']);

it('finds nth and last weekdays and skips missing fifth occurrences', function (array $rule, array $expected) {
    expect(recurrenceDates($rule, '2026-11-01', '2026-12-31'))->toBe($expected);
})->with([
    [['type' => 'monthly_nth_weekday', 'weekday' => 2, 'nth' => 2], ['2026-11-10', '2026-12-08']],
    [['type' => 'monthly_nth_weekday', 'weekday' => 5, 'nth' => -1], ['2026-11-27', '2026-12-25']],
    [['type' => 'monthly_nth_weekday', 'weekday' => 7, 'nth' => 5], ['2026-11-29']],
]);

it('handles year boundaries leap days and ranges without occurrences', function () {
    expect(recurrenceDates(['type' => 'monthly_nth_weekday', 'weekday' => 2, 'nth' => 1], '2026-12-15', '2027-01-05'))
        ->toBe(['2027-01-05'])
        ->and(recurrenceDates(['type' => 'monthly_nth_weekday', 'weekday' => 2, 'nth' => 5], '2028-02-01', '2028-02-29'))
        ->toBe(['2028-02-29'])
        ->and(recurrenceDates(['type' => 'weekly', 'weekday' => 7], '2026-11-02', '2026-11-07'))->toBe([])
        ->and(recurrenceDates(['type' => 'weekly', 'weekday' => 7], '2026-11-09', '2026-11-08'))->toBe([]);
});

it('returns local midnights and treats inputs as calendar dates', function () {
    $from = CarbonImmutable::parse('2026-10-18 22:30', 'Europe/Warsaw');
    $to = CarbonImmutable::parse('2026-11-01 01:15', 'Europe/Warsaw');
    $dates = RecurrenceRule::fromArray(['type' => 'biweekly', 'weekday' => 7, 'anchor_date' => '2026-10-04'])
        ->occurrencesBetween($from, $to);
    expect(array_map(fn (CarbonImmutable $date): string => $date->format('Y-m-d H:i:s e'), $dates))
        ->toBe(['2026-10-18 00:00:00 Europe/Warsaw', '2026-11-01 00:00:00 Europe/Warsaw'])
        ->and($from->format('H:i'))->toBe('22:30')->and($to->format('H:i'))->toBe('01:15');
});
