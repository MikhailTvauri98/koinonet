<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Directory\Models\Person;
use App\Support\DomainRuleException;
use App\Support\Phone;

final class UpdatePerson
{
    /** @param array<string, mixed> $attributes */
    public function handle(Person $person, array $attributes): Person
    {
        if ($person->archived_at !== null) {
            throw DomainRuleException::because(
                'person.archived',
                'Архивного человека изменить нельзя.',
            );
        }

        if (array_key_exists('phone', $attributes)) {
            $attributes['phone'] = Phone::normalize($attributes['phone']);
        }

        if (array_key_exists('email', $attributes)) {
            $attributes['email'] = $attributes['email'] === null
                ? null
                : mb_strtolower(trim((string) $attributes['email']));
        }

        $person->fill($attributes)->save();

        return $person;
    }
}
