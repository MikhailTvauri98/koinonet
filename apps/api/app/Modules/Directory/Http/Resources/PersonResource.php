<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Resources;

use App\Modules\Directory\Models\Person;
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
     *     has_global_roles: bool
     * }
     */
    public function toArray(Request $request): array
    {
        $person = $this->resource;
        assert($person instanceof Person);

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
        ];
    }
}
