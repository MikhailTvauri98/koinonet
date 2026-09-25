<?php

declare(strict_types=1);

namespace App\Modules\Ministries\Http\Resources;

use App\Modules\Access\Models\Role;
use App\Modules\Directory\Models\User;
use App\Modules\Media\SignedMediaUrl;
use App\Modules\Ministries\Models\MinistryMember;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin MinistryMember */
final class MemberResource extends JsonResource
{
    /**
     * @return array{
     *     id: string,
     *     ministry_id: string,
     *     person_id: string,
     *     full_name: string|null,
     *     joined_at: string,
     *     photo_url: string|null,
     *     roles: list<array{id: string, name: string}>
     * }
     */
    public function toArray(Request $request): array
    {
        $member = $this->resource;
        assert($member instanceof MinistryMember);
        $viewer = $request->user();
        assert($viewer instanceof User);

        // Seeing this roster row (`members.manage`/`view_all` or plain
        // membership) is a weaker gate than seeing who is in it (architecture
        // 6.4: "список и базовая карточка: people.view", own exempted). A
        // fellow member without `people.view` sees the row but not the name
        // or the photo behind it - the same `PersonPolicy::view` check
        // `MediaAccess` already uses for the person's own card and photo
        // elsewhere (review round 2, task 28: `full_name` had skipped this
        // check that `photo_url` right below it already had).
        $canViewPerson = Gate::forUser($viewer)->allows('view', $member->person);

        return [
            'id' => $member->id,
            'ministry_id' => $member->ministry_id,
            'person_id' => $member->person_id,
            'full_name' => $canViewPerson ? $member->person->fullName() : null,
            'joined_at' => $member->joined_at->toISOString(),
            'photo_url' => $canViewPerson ? SignedMediaUrl::variant($member->person->photo, 'thumb') : null,
            'roles' => $member->roles->map(fn (Role $role): array => [
                'id' => $role->id,
                'name' => $role->name,
            ])->values()->all(),
        ];
    }
}
