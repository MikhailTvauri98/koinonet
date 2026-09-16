<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Resources;

use App\Modules\Directory\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use stdClass;

/** @mixin User */
final class MeResource extends JsonResource
{
    public static $wrap = null;

    /**
     * @return array{
     *     user: array{id: string, phone: string|null, email: string|null},
     *     person: array{id: string, last_name: string, first_name: string, patronymic: string|null, status: string},
     *     permissions: array{administrator: bool, global: list<string>, ministries: stdClass}
     * }
     */
    public function toArray(Request $request): array
    {
        $user = $this->resource;
        assert($user instanceof User);

        $person = $user->person;

        return [
            'user' => [
                'id' => $user->id,
                'phone' => $user->phone,
                'email' => $user->email,
            ],
            'person' => [
                'id' => $person->id,
                'last_name' => $person->last_name,
                'first_name' => $person->first_name,
                'patronymic' => $person->patronymic,
                'status' => $person->status->value,
            ],
            'permissions' => [
                'administrator' => false,
                'global' => [],
                'ministries' => new stdClass,
            ],
        ];
    }
}
