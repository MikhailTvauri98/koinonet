<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Resources;

use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use App\Modules\Directory\PersonVisibility;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Person */
final class PersonResource extends JsonResource
{
    /**
     * @return array{
     *     id: string,
     *     last_name: string,
     *     first_name: string,
     *     patronymic: string|null,
     *     full_name: string,
     *     status: string,
     *     archived: bool,
     *     has_account: bool,
     *     has_global_roles: bool,
     *     account_disabled: bool,
     *     contacts?: array{phone: string|null, email: string|null, birth_date: string|null},
     *     note?: string|null
     * }
     */
    public function toArray(Request $request): array
    {
        $person = $this->resource;
        assert($person instanceof Person);
        $viewer = $request->user();
        assert($viewer instanceof User);
        $visibility = app(PersonVisibility::class);

        return [
            'id' => $person->id,
            'last_name' => $person->last_name,
            'first_name' => $person->first_name,
            'patronymic' => $person->patronymic,
            'full_name' => $person->fullName(),
            'status' => $person->status->value,
            'archived' => $person->archived_at !== null,
            'has_account' => (bool) $person->getAttribute('user_exists'),
            'has_global_roles' => (bool) $person->getAttribute('global_roles_exists'),
            'account_disabled' => (bool) $person->getAttribute('account_disabled'),
            'contacts' => $this->when(
                $visibility->canSeeContacts($viewer, $person),
                [
                    'phone' => $person->phone,
                    'email' => $person->email,
                    'birth_date' => $person->birth_date?->format('Y-m-d'),
                ],
            ),
            'note' => $this->when(
                $visibility->canSeeNotes($viewer, $person),
                $person->note,
            ),
        ];
    }
}
