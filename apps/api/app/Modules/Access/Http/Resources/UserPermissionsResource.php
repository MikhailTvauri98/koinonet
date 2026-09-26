<?php

declare(strict_types=1);

namespace App\Modules\Access\Http\Resources;

use App\Modules\Access\UserPermissions;
use ArrayObject;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin UserPermissions */
final class UserPermissionsResource extends JsonResource
{
    /** @return array{administrator: bool, global: list<string>, ministries: ArrayObject<string, list<string>>} */
    public function toArray(Request $request): array
    {
        $permissions = $this->resource;
        assert($permissions instanceof UserPermissions);

        return [
            'administrator' => $permissions->administrator,
            'global' => $permissions->global,
            // ArrayObject — чтобы пустой словарь ушёл в JSON объектом `{}`, а не
            // массивом `[]`. Для схемы OpenAPI это словарь «служение → ключи
            // прав», иначе клиент получил бы тип объекта без полей.
            /** @var array<string, list<string>> */
            'ministries' => new ArrayObject($permissions->ministries),
        ];
    }
}
