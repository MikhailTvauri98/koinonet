<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Directory\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

final readonly class EndOtherDevices
{
    public function handle(User $user, string $currentSessionId): void
    {
        DB::transaction(function () use ($user, $currentSessionId): void {
            DB::table('sessions')
                ->where('user_id', $user->id)
                ->where('id', '!=', $currentSessionId)
                ->delete();

            // Also when no other session is listed: a device whose session ran out can
            // still hold a "remember me" cookie, and only a new token shuts it out.
            $user->forceFill(['remember_token' => Str::random(60)])->save();
        });
    }
}
