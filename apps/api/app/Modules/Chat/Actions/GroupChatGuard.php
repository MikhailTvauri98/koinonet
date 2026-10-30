<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\ChatType;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

/** Shared transaction-only locking and validation for group mutations. */
final class GroupChatGuard
{
    public function lock(User $actor, Chat $chat, bool $leaving = false, string $ability = 'update'): Chat
    {
        // Protect account state without blocking message FK KEY SHARE locks.
        $actor = User::query()->lock('for no key update')->find($actor->id);
        $chat = Chat::query()->lockForUpdate()->findOrFail($chat->id);
        if ($actor === null || $actor->isDisabled()) {
            throw new AuthorizationException;
        }
        $chat->setRelation('members', $chat->members()->lockForUpdate()->get());
        if ($chat->type !== ChatType::Group) {
            $code = ! $leaving && in_array($chat->type, [ChatType::Ministry, ChatType::Event], true)
                ? 'chat.members_managed_by_sync' : 'chat.not_group';
            throw DomainRuleException::because($code, 'Это действие доступно только для группы.');
        }
        Gate::forUser($actor)->authorize($leaving ? 'leave' : $ability, $chat);
        if ($chat->archived_at !== null) {
            throw DomainRuleException::because('chat.archived', 'Чат архивирован.');
        }

        return $chat;
    }

    /** @param list<string> $ids
     * @return list<string>
     */
    public function members(array $ids): array
    {
        $ids = array_values(array_unique($ids));
        $users = User::query()->whereIn('id', $ids)->orderBy('id')->lock('for no key update')->get();
        if ($users->count() !== count($ids)) {
            throw ValidationException::withMessages(['member_ids' => 'Аккаунт не найден.', 'user_ids' => 'Аккаунт не найден.']);
        }
        foreach ($users as $user) {
            if ($user->isDisabled() || $user->person->archived_at !== null) {
                throw DomainRuleException::because('chat.member_disabled', 'Нельзя добавить отключённый аккаунт.');
            }
        }

        return $ids;
    }

    public function title(string $title): string
    {
        $title = trim($title);
        if ($title === '' || mb_strlen($title) > 100) {
            throw ValidationException::withMessages(['title' => 'Введите название группы длиной до 100 символов.']);
        }

        return $title;
    }
}
