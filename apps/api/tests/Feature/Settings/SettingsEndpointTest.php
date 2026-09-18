<?php

declare(strict_types=1);

use App\Modules\Access\Models\AuditEntry;
use App\Modules\Access\Permission;
use App\Modules\Settings\ChurchSettings;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;

uses(RefreshDatabase::class);

beforeEach(function (): void {
    Cache::forget('settings');
});

it('shows the public settings to any account', function () {
    actingAsUser();

    $this->getJson('/api/v1/settings')
        ->assertOk()
        ->assertJsonStructure(['data' => ['church_name', 'timezone']])
        ->assertJsonMissingPath('data.phone_region');
});

it('denies changing settings without settings.manage', function () {
    actingAsUser();

    $this->putJson('/api/v1/settings', ['timezone' => 'Europe/Moscow'])->assertForbidden();
});

it('changes the timezone and the phone region', function () {
    actingAsUserWith([Permission::SettingsManage]);

    $this->putJson('/api/v1/settings', [
        'church_name' => 'Дом хлеба',
        'timezone' => 'Europe/Moscow',
        'phone_region' => 'RU',
    ])->assertOk()->assertJsonPath('data.timezone', 'Europe/Moscow');

    $settings = app(ChurchSettings::class);

    expect($settings->name())->toBe('Дом хлеба')
        ->and($settings->timezone())->toBe('Europe/Moscow')
        ->and($settings->phoneRegion())->toBe('RU');
});

it('rejects an unknown timezone', function () {
    actingAsUserWith([Permission::SettingsManage]);

    $this->putJson('/api/v1/settings', ['timezone' => 'Mars/Olympus'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('timezone');
});

it('records the change in the journal', function () {
    actingAsUserWith([Permission::SettingsManage]);

    $this->putJson('/api/v1/settings', ['timezone' => 'Europe/Moscow']);

    expect(AuditEntry::query()->where('action', 'settings.changed')->exists())->toBeTrue();
});
