<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

final class MuteChat
{
    public function handle(User $user, Chat $chat, ?CarbonImmutable $until = null): void
    {
        $this->set($user, $chat, $until?->utc() ?? CarbonImmutable::parse('9999-12-31 00:00:00', 'UTC'));
    }

    public function set(User $user, Chat $chat, ?CarbonImmutable $until): void
    {
        DB::transaction(function () use ($user, $chat, $until): void {
            $actor = User::query()->whereKey($user->id)->lockForUpdate()->first();
            $chat = Chat::query()->findOrFail($chat->id);
            $member = $chat->members()->where('user_id', $user->id)->lockForUpdate()->first();
            if ($actor === null) {
                throw new AuthorizationException;
            }
            $chat->setRelation('members', new Collection($member === null ? [] : [$member]));
            Gate::forUser($actor)->authorize('mute', $chat);
            assert($member !== null);
            if ($until !== null && ! $until->isFuture()) {
                throw ValidationException::withMessages(['until' => 'Укажите время в будущем.']);
            }
            $member->update(['muted_until' => $until?->utc()]);
        });
    }
}
