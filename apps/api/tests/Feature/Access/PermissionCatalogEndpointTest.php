<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

it('requires a session', function () {
    $this->getJson('/api/v1/permissions')->assertStatus(401);
});

it('returns the catalogue with scope metadata', function () {
    actingAsUser();

    $this->getJson('/api/v1/permissions')
        ->assertOk()
        ->assertJsonCount(count(Permission::cases()), 'data')
        ->assertJsonStructure(['data' => [['key', 'scope', 'label', 'description']]]);
});
