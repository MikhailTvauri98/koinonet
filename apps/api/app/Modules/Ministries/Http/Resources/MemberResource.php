<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Http\Resources;

use App\Modules\Access\Models\Role;
use App\Modules\Ministries\Models\MinistryMember;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin MinistryMember */
final class MemberResource extends JsonResource
{
    /**
     * @return array{
     *     id: string,
     *     ministry_id: string,
     *     person_id: string,
     *     joined_at: string,
     *     roles: list<array{id: string, name: string}>
     * }
     */
    public function toArray(Request $request): array
    {
        $member = $this->resource;
        assert($member instanceof MinistryMember);

        return [
            'id' => $member->id,
            'ministry_id' => $member->ministry_id,
            'person_id' => $member->person_id,
            'joined_at' => $member->joined_at->toISOString(),
            'roles' => $member->roles->map(fn (Role $role): array => [
                'id' => $role->id,
                'name' => $role->name,
            ])->values()->all(),
        ];
    }
}
