<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Calendar\Models\Event;
use App\Modules\Chat\ChatType;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final readonly class CreateEventChat
{
    public function __construct(private SyncEventChatMember $members) {}

    /** @return array{chat: Chat, created: bool} */
    public function handle(Event $event, User $creator): array
    {
        return DB::transaction(function () use ($event, $creator): array {
            // Calendar assignment mutations lock this same row before touching slots.
            // Holding it through the snapshot prevents a lost create/sync race.
            $event = Event::query()->lockForUpdate()->findOrFail($event->id);
            $actor = User::query()->whereNull('disabled_at')->whereHas('person', fn ($query) => $query->whereNull('archived_at'))->find($creator->id);
            if ($actor === null || $event->archived_at !== null
                || ($event->ministry_id !== null && $event->ministry?->archived_at !== null)) {
                throw new AuthorizationException;
            }
            Gate::forUser($actor)->authorize('update', $event);
            $chat = Chat::query()->firstOrCreate(['event_id' => $event->id], ['type' => ChatType::Event, 'created_by_user_id' => $actor->id]);
            $created = $chat->wasRecentlyCreated;
            // Repair from current truth, retaining only the original creator exception.
            $ids = User::query()->whereIn('person_id', $event->assignedPersonIds())->pluck('id')
                ->merge($chat->members()->pluck('user_id'))->push($chat->created_by_user_id)->filter()->unique();
            foreach (User::query()->whereIn('id', $ids)->cursor() as $user) {
                $this->members->add($chat, $user);
            }

            return ['chat' => $chat->refresh(), 'created' => $created];
        });
    }
}
