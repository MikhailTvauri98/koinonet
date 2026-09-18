<?php

declare(strict_types=1);

namespace App\Modules\Directory;

use App\Modules\Access\Permission;
use App\Modules\Access\PermissionResolver;
use App\Modules\Directory\Contracts\SharedMinistryFinder;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;

final readonly class PersonVisibility
{
    public function __construct(
        private PermissionResolver $permissions,
        private SharedMinistryFinder $ministries,
    ) {}

    public function canSeeContacts(User $viewer, Person $person): bool
    {
        if ($viewer->isDisabled()) {
            return false;
        }

        if ($viewer->person_id === $person->id) {
            return true;
        }

        if ($this->permissions->can($viewer, Permission::PeopleViewContacts)) {
            return true;
        }

        if ($person->contacts_public) {
            return true;
        }

        foreach ($this->ministries->sharedMinistryIds($viewer->person_id, $person->id) as $ministryId) {
            if ($this->permissions->canInMinistry($viewer, Permission::MembersViewContacts, $ministryId)) {
                return true;
            }
        }

        return false;
    }

    public function canSeeNotes(User $viewer, Person $person): bool
    {
        if ($viewer->person_id === $person->id) {
            return false;
        }

        return $this->permissions->can($viewer, Permission::PeopleViewNotes);
    }
}
