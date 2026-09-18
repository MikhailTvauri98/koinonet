<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Directory\Models\Person;

final readonly class RestorePerson
{
    public function __construct(private AuditLogger $audit) {}

    public function handle(Person $person): Person
    {
        $person->forceFill(['archived_at' => null])->save();
        $this->audit->record('person.restored', $person);

        return $person;
    }
}
