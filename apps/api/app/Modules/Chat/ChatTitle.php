<?php

declare(strict_types=1);

namespace App\Modules\Chat;

use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\Person;
use App\Modules\Directory\Models\User;
use Illuminate\Support\Facades\Gate;

final class ChatTitle
{
    public function for(Chat $chat, User $viewer): string
    {
        return match ($chat->type) {
            ChatType::Ministry => $chat->ministry->name ?? '',
            ChatType::Event => $chat->event->title ?? '',
            ChatType::Group => $chat->title ?? '',
            ChatType::Direct => $this->visiblePartner($viewer, $chat)?->fullName() ?? 'Личный чат',
        };
    }

    public function visiblePartner(User $viewer, Chat $chat): ?Person
    {
        $partner = $chat->members->first(fn (ChatMember $member): bool => $member->user_id !== $viewer->id)?->user->person;

        return $partner !== null && Gate::forUser($viewer)->allows('view', $partner) ? $partner : null;
    }
}
