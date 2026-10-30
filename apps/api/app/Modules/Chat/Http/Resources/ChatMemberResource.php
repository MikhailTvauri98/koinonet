<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Resources;

use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\User;
use App\Modules\Media\SignedMediaUrl;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Gate;

/** @mixin ChatMember */
final class ChatMemberResource extends JsonResource
{
    /** @return array{user_id: string, person_id: string, full_name: string|null, photo_url: string|null, is_owner: bool, joined_at: string} */
    public function toArray(Request $request): array
    {
        $member = $this->resource;
        assert($member instanceof ChatMember);
        $viewer = $request->user();
        assert($viewer instanceof User);
        $person = $member->user->person;
        $visible = Gate::forUser($viewer)->allows('view', $person);

        return [
            'user_id' => $member->user_id,
            'person_id' => $person->id,
            'full_name' => $visible ? $person->fullName() : null,
            'photo_url' => $visible ? SignedMediaUrl::variant($person->photo, 'thumb') : null,
            'is_owner' => $member->is_owner,
            /** @format date-time */
            'joined_at' => (string) $member->joined_at->toISOString(),
        ];
    }
}
