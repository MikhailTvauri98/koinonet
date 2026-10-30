<?php

declare(strict_types=1);

namespace App\Modules\Chat\Listeners;

use App\Modules\Calendar\Events\AssignmentCreated;
use App\Modules\Calendar\Events\AssignmentRemoved;
use App\Modules\Chat\Actions\SyncEventChatMember;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;

final readonly class SyncEventChatOnAssignment implements ShouldQueueAfterCommit
{
    public function __construct(private SyncEventChatMember $members) {}

    public function handle(AssignmentCreated|AssignmentRemoved $event): void
    {
        $chat = Chat::query()->where('event_id', $event->eventId)->whereNull('archived_at')->first();
        // An assignment may predate the account or contain a historical account id.
        $user = User::query()->where('person_id', $event->personId)->first();
        if ($chat !== null && $user !== null) {
            if ($event instanceof AssignmentRemoved) {
                $this->members->remove($chat, $user);
            } else {
                $this->members->add($chat, $user);
            }
        }
    }
}
