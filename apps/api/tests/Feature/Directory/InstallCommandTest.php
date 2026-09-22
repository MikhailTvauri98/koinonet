<?php

declare(strict_types=1);

use App\Modules\Access\Models\Role;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Settings\ChurchSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;

uses(RefreshDatabase::class);

/**
 * @param  array<string, string>  $overrides
 * @return array<string, string>
 */
function installOptions(array $overrides = []): array
{
    return [
        '--church-name' => 'Дом хлеба',
        '--timezone' => 'Europe/Moscow',
        '--phone-region' => 'RU',
        '--last-name' => 'Иванов',
        '--first-name' => 'Иван',
        '--login' => 'ivan@example.com',
        '--password' => 'secret123',
        ...$overrides,
    ];
}

it('installs settings, the administrator role, a person and an account', function () {
    $this->artisan('app:install', installOptions())->assertSuccessful();

    $settings = app(ChurchSettings::class);
    $user = User::query()->sole();

    expect($settings->name())->toBe('Дом хлеба')
        ->and($settings->timezone())->toBe('Europe/Moscow')
        ->and($settings->phoneRegion())->toBe('RU')
        ->and(Role::query()->where('is_system', true)->count())->toBe(1)
        ->and(Person::query()->sole()->last_name)->toBe('Иванов')
        ->and($user->email)->toBe('ivan@example.com')
        ->and(Hash::check('secret123', $user->password))->toBeTrue();
});

it('gives the first person the administrator role', function () {
    $this->artisan('app:install', installOptions())->assertSuccessful();

    expect(Person::query()->sole()->globalRoles()->sole()->is_system)->toBeTrue();
});

it('creates no roles besides the administrator', function () {
    $this->artisan('app:install', installOptions())->assertSuccessful();

    expect(Role::query()->count())->toBe(1);
});

it('accepts a phone as the login of the first administrator', function () {
    $this->artisan('app:install', installOptions(['--login' => '8 912 345 67 89']))->assertSuccessful();

    $user = User::query()->sole();

    expect($user->phone)->toBe('+79123456789')
        ->and($user->email)->toBeNull();
});

it('refuses to run twice', function () {
    $this->artisan('app:install', installOptions())->assertSuccessful();

    $this->artisan('app:install', installOptions(['--login' => 'second@example.com']))->assertFailed();

    expect(User::query()->count())->toBe(1);
});

it('refuses an unknown timezone and stores nothing', function () {
    $this->artisan('app:install', installOptions(['--timezone' => 'Europe/Nowhere']))->assertFailed();

    expect(Role::query()->count())->toBe(0)
        ->and(Person::query()->count())->toBe(0);
});

it('refuses a login that is neither a phone nor an email', function () {
    $this->artisan('app:install', installOptions(['--login' => 'не-логин']))->assertFailed();

    expect(User::query()->count())->toBe(0);
});
