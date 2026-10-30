<?php

declare(strict_types=1);

namespace App\Modules\Chat\Listeners;

use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\Event as CalendarEvent;
use App\Modules\Chat\Actions\CreateMinistryChat;
use App\Modules\Chat\Actions\SyncEventChatMember;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Events\UserCreated;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;

final readonly class AddNewUserToChats implements ShouldQueueAfterCommit
{
    public function __construct(private CreateMinistryChat $create, private SyncEventChatMember $events) {}

    public function handle(UserCreated $event): void
    {
        $user = User::query()->where('person_id', $event->personId)->whereNull('disabled_at')
            ->whereHas('person', fn ($query) => $query->whereNull('archived_at'))->find($event->userId);
        if ($user === null) {
            return;
        }
        foreach (Ministry::query()->whereNull('archived_at')->whereHas('members', fn ($query) => $query->where('person_id', $user->person_id))->cursor() as $ministry) {
            $this->create->handle($ministry);
        }
        foreach (Chat::query()->whereNull('archived_at')->whereIn('event_id', CalendarEvent::query()
            ->whereNull('archived_at')->where('status', EventStatus::Scheduled)
            ->whereHas('slots', fn ($slots) => $slots->whereNull('archived_at')->whereHas('assignments', fn ($assignments) => $assignments->whereNull('archived_at')->where('person_id', $user->person_id)))
            ->select('id'))->cursor() as $chat) {
            $this->events->catchUp($chat, $user);
        }
    }
}
