<?php

declare(strict_types=1);

use App\Modules\Directory\Models\Person;
use Tests\TestCase;

uses(TestCase::class);

it('builds the short name without patronymic', function () {
    $person = new Person;
    $person->setAttribute('last_name', 'Кузнецова');
    $person->setAttribute('first_name', 'Мария');
    $person->setAttribute('patronymic', 'Игоревна');
    expect($person->shortName())->toBe('Мария Кузнецова');

    $person = new Person;
    $person->setAttribute('last_name', 'Орлов');
    $person->setAttribute('first_name', 'Михаил');
    $person->setAttribute('patronymic', null);
    expect($person->shortName())->toBe('Михаил Орлов');
});
