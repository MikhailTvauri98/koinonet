<?php

declare(strict_types=1);

use App\Support\DomainRuleException;
use Illuminate\Support\Facades\Route;

it('renders a domain rule violation as 422 with a code', function () {
    Route::get('/__test/domain', fn () => throw DomainRuleException::because('role.in_use', 'Роль используется.'));

    $this->getJson('/__test/domain')
        ->assertStatus(422)
        ->assertJson(['message' => 'Роль используется.', 'code' => 'role.in_use']);
});
