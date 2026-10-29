<?php

declare(strict_types=1);

use App\Modules\Calendar\RecurrenceRule;

it('returns null for no recurrence', function () {
    expect(RecurrenceRule::fromArray(null))->toBeNull();
});

it('round trips each supported recurrence shape', function (array $data) {
    $rule = RecurrenceRule::fromArray($data);
    expect($rule?->toArray())->toBe($data);
})->with([
    [['type' => 'weekly', 'weekday' => 7]],
    [['type' => 'biweekly', 'weekday' => 6, 'anchor_date' => '2026-11-08']],
    [['type' => 'monthly_nth_weekday', 'weekday' => 2, 'nth' => -1]],
    [['type' => 'monthly_nth_weekday', 'weekday' => 2, 'nth' => 5]],
]);

it('rejects malformed recurrence shapes and calendar dates', function (array $data) {
    expect(fn () => RecurrenceRule::fromArray($data))->toThrow(InvalidArgumentException::class);
})->with([
    [[]],
    [['type' => 'daily', 'weekday' => 1]],
    [['type' => 'weekly', 'weekday' => 0]],
    [['type' => 'weekly', 'weekday' => 8]],
    [['type' => 'weekly', 'weekday' => '7']],
    [['type' => 'weekly', 'weekday' => 7, 'nth' => 1]],
    [['type' => 'weekly', 'weekday' => 7, 'anchor_date' => null]],
    [['type' => 'weekly', 'weekday' => 7, 'extra' => true]],
    [['type' => 'biweekly', 'weekday' => 1]],
    [['type' => 'biweekly', 'weekday' => 1, 'anchor_date' => 'tomorrow']],
    [['type' => 'biweekly', 'weekday' => 1, 'anchor_date' => '2026-02-30']],
    [['type' => 'biweekly', 'weekday' => 1, 'anchor_date' => '2026-1-01']],
    [['type' => 'biweekly', 'weekday' => 1, 'anchor_date' => '2026-11-07T00:00:00Z']],
    [['type' => 'biweekly', 'weekday' => 1, 'anchor_date' => 20261107]],
    [['type' => 'monthly_nth_weekday', 'weekday' => 1, 'nth' => 6]],
    [['type' => 'monthly_nth_weekday', 'weekday' => 1, 'nth' => 0]],
    [['type' => 'monthly_nth_weekday', 'weekday' => 1, 'nth' => -2]],
    [['type' => 'monthly_nth_weekday', 'weekday' => 1, 'nth' => '1']],
]);
