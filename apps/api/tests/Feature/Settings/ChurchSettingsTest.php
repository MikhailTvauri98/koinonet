<?php

declare(strict_types=1);

use App\Modules\Settings\ChurchSettings;
use App\Modules\Settings\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('falls back to defaults when nothing is stored', function () {
    expect(app(ChurchSettings::class)->timezone())->toBe('UTC')
        ->and(app(ChurchSettings::class)->phoneRegion())->toBe('RU');
});

it('stores and reads values back', function () {
    $settings = app(ChurchSettings::class);
    $settings->put(['church.timezone' => 'Europe/Moscow', 'church.name' => 'Дом хлеба']);

    expect($settings->timezone())->toBe('Europe/Moscow')
        ->and($settings->name())->toBe('Дом хлеба');
});

it('rejects an unknown key', function () {
    expect(fn () => app(ChurchSettings::class)->put(['church.colour' => 'blue']))
        ->toThrow(InvalidArgumentException::class);
});

it('does not store known values when another key is unknown', function () {
    $settings = app(ChurchSettings::class);

    expect(fn () => $settings->put([
        'church.name' => 'Дом хлеба',
        'church.colour' => 'blue',
    ]))->toThrow(InvalidArgumentException::class);

    expect(Setting::query()->count())->toBe(0);
});
