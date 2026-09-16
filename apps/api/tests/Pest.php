<?php

declare(strict_types=1);

use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Tests\TestCase;

pest()->extend(TestCase::class)->in('Feature');

/** @param array<string, mixed> $attributes */
function actingAsUser(?Person $person = null, array $attributes = []): User
{
    $user = User::factory()
        ->for($person ?? Person::factory()->create())
        ->create($attributes);

    test()->actingAs($user, 'web');

    return $user;
}
