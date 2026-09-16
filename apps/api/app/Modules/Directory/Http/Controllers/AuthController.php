<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Controllers;

use App\Modules\Directory\Http\Requests\LoginRequest;
use App\Modules\Directory\Http\Resources\MeResource;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use App\Support\Phone;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

final class AuthController
{
    public function login(LoginRequest $request): MeResource
    {
        $login = trim($request->string('login')->toString());
        $candidate = filter_var($login, FILTER_VALIDATE_EMAIL)
            ? ['email' => mb_strtolower($login)]
            : ['phone' => Phone::normalize($login)];

        $user = User::query()->where($candidate)->first();

        if ($user === null || ! Hash::check($request->string('password')->toString(), $user->getAuthPassword())) {
            throw ValidationException::withMessages([
                'login' => 'Неверный логин или пароль.',
            ]);
        }

        if ($user->isDisabled()) {
            throw DomainRuleException::because('auth.account_disabled', 'Аккаунт отключён.');
        }

        Auth::guard('web')->login($user, $request->boolean('remember'));
        $request->session()->regenerate();
        $user->forceFill(['last_login_at' => now()])->save();

        return new MeResource($user->load('person'));
    }

    public function logout(Request $request): Response
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->noContent();
    }

    public function me(Request $request): MeResource
    {
        $user = $request->user();
        assert($user instanceof User);

        return new MeResource($user->load('person'));
    }
}
