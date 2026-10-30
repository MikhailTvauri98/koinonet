<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Calendar\EventStatus;
use App\Modules\Calendar\Models\Event;
use App\Modules\Calendar\Models\EventAssignment;
use App\Modules\Chat\ChatType;
use App\Modules\Chat\Events\ChatMembersChanged;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\Models\ChatMember;
use App\Modules\Directory\Models\User;
use Illuminate\Support\Facades\DB;

final class SyncEventChatMember
{
    public function add(Chat $chat, User $user): void
    {
        $this->reconcile($chat, $user);
    }

    public function remove(Chat $chat, User $user): void
    {
        $this->reconcile($chat, $user);
    }

    public function catchUp(Chat $chat, User $user): void
    {
        $this->reconcile($chat, $user, scheduledOnly: true);
    }

    private function reconcile(Chat $chat, User $user, bool $scheduledOnly = false): void
    {
        DB::transaction(function () use ($chat, $user, $scheduledOnly): void {
            // Match Calendar and creation lock order; queue verbs may be out of date.
            $event = Event::query()->lockForUpdate()->find($chat->event_id);
            if ($event === null || $event->archived_at !== null
                || ($scheduledOnly && $event->status !== EventStatus::Scheduled)
                || ($event->ministry_id !== null && $event->ministry?->archived_at !== null)) {
                return;
            }
            $chat = Chat::query()->where('type', ChatType::Event)->whereNull('archived_at')->lockForUpdate()->find($chat->id);
            $user = User::query()->with('person')->find($user->id);
            if ($chat === null || $chat->event_id !== $event->id || $user === null) {
                return;
            }
            $assigned = EventAssignment::query()->where('person_id', $user->person_id)->whereNull('archived_at')
                ->whereHas('slot', fn ($query) => $query->where('event_id', $event->id)->whereNull('archived_at'))->exists();
            $belongs = ! $user->isDisabled() && $user->person->archived_at === null
                && ($assigned || $chat->created_by_user_id === $user->id);
            if ($belongs) {
                $member = ChatMember::query()->firstOrCreate(['chat_id' => $chat->id, 'user_id' => $user->id], ['joined_at' => now()]);
                if ($member->wasRecentlyCreated) {
                    DB::afterCommit(fn () => ChatMembersChanged::dispatch($chat->id, [$user->id], []));
                }
            } elseif (ChatMember::query()->where('chat_id', $chat->id)->where('user_id', $user->id)->delete() > 0) {
                DB::afterCommit(fn () => ChatMembersChanged::dispatch($chat->id, [], [$user->id]));
            }
        });
    }
}
