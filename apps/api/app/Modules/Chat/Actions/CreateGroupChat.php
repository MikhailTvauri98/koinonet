<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\ChatType;
use App\Modules\Chat\Events\ChatMembersChanged;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final readonly class CreateGroupChat
{
    public function __construct(private GroupChatGuard $guard) {}

    /** @param list<string> $memberIds */
    public function handle(User $owner, string $title, array $memberIds): Chat
    {
        return DB::transaction(function () use ($owner, $title, $memberIds): Chat {
            // Reciprocal group creation takes account locks in the same order.
            User::query()->whereIn('id', [$owner->id, ...$memberIds])->orderBy('id')->lock('for no key update')->get();
            $owner = User::query()->find($owner->id);
            if ($owner === null) {
                throw new AuthorizationException;
            }
            Gate::forUser($owner)->authorize('create', Chat::class);
            $ids = array_values(array_diff(array_unique($memberIds), [$owner->id]));
            if ($ids === []) {
                throw ValidationException::withMessages(['member_ids' => 'Добавьте хотя бы один другой аккаунт.']);
            }
            $ids = $this->guard->members($ids);
            $chat = Chat::query()->create(['type' => ChatType::Group, 'title' => $this->guard->title($title), 'created_by_user_id' => $owner->id]);
            foreach ([$owner->id, ...$ids] as $id) {
                $chat->members()->create(['user_id' => $id, 'is_owner' => $id === $owner->id, 'joined_at' => now()]);
            }
            DB::afterCommit(fn () => ChatMembersChanged::dispatch($chat->id, [$owner->id, ...$ids], []));

            return $chat;
        });
    }
}
