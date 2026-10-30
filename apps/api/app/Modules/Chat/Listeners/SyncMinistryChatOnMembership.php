<?php

declare(strict_types=1);

namespace App\Modules\Chat\Listeners;

use App\Modules\Chat\Actions\SyncMinistryChatMember;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Events\MemberAdded;
use App\Modules\Ministries\Events\MemberRemoved;
use App\Modules\Ministries\Models\MinistryMember;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;

final readonly class SyncMinistryChatOnMembership implements ShouldQueueAfterCommit
{
    public function __construct(private SyncMinistryChatMember $members) {}

    public function handle(MemberAdded|MemberRemoved $event): void
    {
        $chat = Chat::query()->where('ministry_id', $event->ministryId)->whereNull('archived_at')->first();
        $user = User::query()->where('person_id', $event->personId)->first();
        if ($chat === null || $user === null) {
            return;
        }
        // Queue delivery order is not membership order: always reconcile the current state.
        $belongs = MinistryMember::query()->where('ministry_id', $event->ministryId)->where('person_id', $event->personId)->exists();
        if (! $belongs) {
            $this->members->remove($chat, $user);
        } elseif (! $user->isDisabled() && $user->person->archived_at === null && $chat->ministry?->archived_at === null) {
            $this->members->add($chat, $user);
        }
    }
}
