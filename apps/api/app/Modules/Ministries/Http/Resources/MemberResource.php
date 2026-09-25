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
     *     full_name: string,
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

        return [
            'id' => $member->id,
            'ministry_id' => $member->ministry_id,
            'person_id' => $member->person_id,
            // Task 28 (web, members tab): the roster row needs a name to show
            // next to the photo. Seeing it is the same gate as seeing the row
            // itself (`members.manage`/`view_all` or plain membership) - a
            // person's name is not more sensitive than the fact they belong
            // to this ministry, which the row already discloses unconditionally.
            'full_name' => $member->person->fullName(),
            'joined_at' => $member->joined_at->toISOString(),
            // Seeing this roster row (`members.manage`/`view_all` or plain
            // membership) is a weaker gate than seeing a photo (architecture
            // 6.4: "фото человека тем, у кого people.view", own exempted).
            // A fellow member without `people.view` sees the row but not
            // the photo - the same `PersonPolicy::view` `MediaAccess`
            // already uses for the person's own card and photo elsewhere.
            'photo_url' => Gate::forUser($viewer)->allows('view', $member->person)
                ? SignedMediaUrl::variant($member->person->photo, 'thumb')
                : null,
            'roles' => $member->roles->map(fn (Role $role): array => [
                'id' => $role->id,
                'name' => $role->name,
            ])->values()->all(),
        ];
    }
}
