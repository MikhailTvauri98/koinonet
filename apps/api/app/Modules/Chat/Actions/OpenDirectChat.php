<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\ChatType;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;

final class OpenDirectChat
{
    /** @return array{chat: Chat, created: bool} */
    public function handle(User $me, User $other): array
    {
        return DB::transaction(function () use ($me, $other): array {
            // Serialize reciprocal opens on the same ordered account locks.
            // Account locks precede Chat/member locks, as in group mutations.
            $users = User::query()->whereIn('id', [$me->id, $other->id])->orderBy('id')->lockForUpdate()->get()->keyBy('id');
            $actor = $users->get($me->id);
            if ($actor === null) {
                throw new AuthorizationException;
            }
            Gate::forUser($actor)->authorize('openDirect', Chat::class);
            if ($me->id === $other->id) {
                throw DomainRuleException::because('chat.direct_self', 'Нельзя открыть чат с самим собой.');
            }
            $partner = $users->get($other->id);
            if ($partner === null || $partner->isDisabled()) {
                throw DomainRuleException::because('chat.direct_user_disabled', 'Аккаунт собеседника отключён.');
            }
            $key = Chat::directKey($actor->id, $partner->id);
            $existing = Chat::query()->where('direct_key', $key)->first();
            if ($existing !== null) {
                return ['chat' => $existing, 'created' => false];
            }
            $chat = Chat::query()->create(['type' => ChatType::Direct, 'direct_key' => $key, 'created_by_user_id' => $actor->id]);
            foreach ([$actor, $partner] as $user) {
                $chat->members()->create(['user_id' => $user->id, 'joined_at' => now()]);
            }

            return ['chat' => $chat, 'created' => true];
        });
    }
}
