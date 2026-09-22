<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Access\AuditLogger;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use App\Support\Phone;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

final readonly class UpdateOwnLogin
{
    public function __construct(private AuditLogger $audit) {}

    public function handle(User $user, string $login, string $currentPassword): User
    {
        if (! Hash::check($currentPassword, $user->getAuthPassword())) {
            throw DomainRuleException::because('auth.invalid_password', 'Неверный текущий пароль.');
        }

        $login = trim($login);
        $credentials = filter_var($login, FILTER_VALIDATE_EMAIL)
            ? ['phone' => null, 'email' => mb_strtolower($login)]
            : ['phone' => Phone::normalize($login), 'email' => null];
        $column = $credentials['email'] !== null ? 'email' : 'phone';

        return DB::transaction(function () use ($user, $credentials, $column): User {
            $taken = User::query()
                ->where($column, $credentials[$column])
                ->whereKeyNot($user->id)
                ->lockForUpdate()
                ->exists();

            if ($taken) {
                throw DomainRuleException::because('login.taken', 'Этот логин уже используется.');
            }

            $user->forceFill($credentials)->save();
            $this->audit->record('user.login_changed', $user, [$column => $credentials[$column]]);

            return $user;
        });
    }
}
