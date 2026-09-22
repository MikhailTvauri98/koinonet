<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

final readonly class UpdateOwnPassword
{
    public function handle(User $user, string $currentPassword, string $password, string $currentSessionId): User
    {
        if (! Hash::check($currentPassword, $user->getAuthPassword())) {
            throw DomainRuleException::because('auth.invalid_password', 'Неверный текущий пароль.');
        }

        $user->forceFill([
            'password' => Hash::make($password),
            'remember_token' => Str::random(60),
        ])->save();

        DB::table('sessions')
            ->where('user_id', $user->id)
            ->where('id', '!=', $currentSessionId)
            ->delete();

        return $user;
    }
}
