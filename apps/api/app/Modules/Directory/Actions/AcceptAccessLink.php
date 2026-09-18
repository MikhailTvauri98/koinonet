<?php

declare(strict_types=1);

namespace App\Modules\Directory\Actions;

use App\Modules\Directory\AccessLinkKind;
use App\Modules\Directory\Events\UserCreated;
use App\Modules\Directory\Models\AccessLink;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use App\Support\Phone;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

final class AcceptAccessLink
{
    /**
     * @param  array{login?: string, password: string}  $attributes
     * @return array{kind: AccessLinkKind, user: User|null}
     */
    public function handle(string $token, array $attributes): array
    {
        $result = DB::transaction(function () use ($token, $attributes): array {
            $link = AccessLink::query()
                ->where('token_hash', hash('sha256', $token))
                ->lockForUpdate()
                ->first();

            if ($link === null) {
                throw DomainRuleException::because('access_link.invalid', 'Ссылка недействительна.');
            }

            $link->ensureUsable();

            return match ($link->kind) {
                AccessLinkKind::Invite => $this->acceptInvitation($link, $attributes),
                AccessLinkKind::PasswordReset => $this->resetPassword($link, $attributes),
            };
        });

        if ($result['user'] !== null && $result['kind'] === AccessLinkKind::Invite) {
            $user = $result['user'];
            UserCreated::dispatch($user->id, $user->person_id);
            Auth::guard('web')->login($user);
            request()->session()->regenerate();
        }

        return $result;
    }

    /**
     * @param  array{login?: string, password: string}  $attributes
     * @return array{kind: AccessLinkKind, user: User}
     */
    private function acceptInvitation(AccessLink $link, array $attributes): array
    {
        if (! array_key_exists('login', $attributes)) {
            throw ValidationException::withMessages(['login' => 'Укажите телефон или электронную почту.']);
        }

        $login = trim($attributes['login']);
        $credentials = filter_var($login, FILTER_VALIDATE_EMAIL)
            ? ['phone' => null, 'email' => mb_strtolower($login)]
            : ['phone' => Phone::normalize($login), 'email' => null];
        $column = $credentials['email'] !== null ? 'email' : 'phone';

        if (User::query()->where($column, $credentials[$column])->exists()) {
            throw DomainRuleException::because('login.taken', 'Этот логин уже используется.');
        }

        $user = User::query()->create([
            'person_id' => $link->person_id,
            ...$credentials,
            'password' => Hash::make($attributes['password']),
        ]);

        $link->forceFill(['used_at' => now()])->save();

        return ['kind' => AccessLinkKind::Invite, 'user' => $user];
    }

    /**
     * @param  array{login?: string, password: string}  $attributes
     * @return array{kind: AccessLinkKind, user: null}
     */
    private function resetPassword(AccessLink $link, array $attributes): array
    {
        if (array_key_exists('login', $attributes)) {
            throw ValidationException::withMessages([
                'login' => 'Логин нельзя менять через ссылку сброса пароля.',
            ]);
        }

        $user = User::query()->where('person_id', $link->person_id)->lockForUpdate()->first();

        if ($user === null) {
            throw DomainRuleException::because('access_link.invalid', 'Ссылка недействительна.');
        }

        $user->forceFill(['password' => Hash::make($attributes['password'])])->save();
        DB::table('sessions')->where('user_id', $user->id)->delete();
        $link->forceFill(['used_at' => now()])->save();

        return ['kind' => AccessLinkKind::PasswordReset, 'user' => null];
    }
}
