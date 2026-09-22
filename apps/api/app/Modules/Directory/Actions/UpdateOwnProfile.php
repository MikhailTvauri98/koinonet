<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Directory\Models\Person;

final readonly class UpdateOwnProfile
{
    public function __construct(private UpdatePerson $updatePerson) {}

    /** @param array<string, mixed> $attributes */
    public function handle(Person $person, array $attributes): Person
    {
        return $this->updatePerson->handle($person, $attributes);
    }
}
