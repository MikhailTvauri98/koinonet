<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Directory\Events\PersonArchived;
use App\Modules\Directory\Models\Person;

final readonly class ArchivePerson
{
    public function __construct(private AuditLogger $audit) {}

    public function handle(Person $person): Person
    {
        $person->forceFill(['archived_at' => now()])->save();
        $this->audit->record('person.archived', $person);
        PersonArchived::dispatch($person->id);

        return $person;
    }
}
