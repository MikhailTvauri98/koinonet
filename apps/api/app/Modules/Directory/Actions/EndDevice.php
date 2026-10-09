<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final readonly class EndDevice
{
    /** @return bool false when the account has no such device */
    public function handle(User $user, string $sessionId, string $currentSessionId): bool
    {
        if ($sessionId === $currentSessionId) {
            throw DomainRuleException::because(
                'session.current_cannot_be_revoked',
                'Текущее устройство завершить нельзя.',
            );
        }

        return DB::transaction(function () use ($user, $sessionId): bool {
            $ended = DB::table('sessions')
                ->where('user_id', $user->id)
                ->where('id', $sessionId)
                ->delete() > 0;

            if ($ended) {
                // The ended device may also hold a "remember me" cookie, which would start
                // a new session without the deleted one. The cookie carries the account's
                // single remember token, so only a new token shuts it out.
                $user->forceFill(['remember_token' => Str::random(60)])->save();
            }

            return $ended;
        });
    }
}
