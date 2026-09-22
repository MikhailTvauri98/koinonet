<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Controllers;

use App\Modules\Directory\Http\Resources\SessionResource;
use App\Modules\Directory\Models\User;
use App\Support\DomainRuleException;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;

final class SessionController
{
    public function index(Request $request): AnonymousResourceCollection
    {
        return SessionResource::collection(
            DB::table('sessions')
                ->where('user_id', $this->user($request)->id)
                ->orderByDesc('last_activity')
                ->get(),
        );
    }

    public function destroy(Request $request, string $session): Response
    {
        if ($session === $request->session()->getId()) {
            throw DomainRuleException::because(
                'session.current_cannot_be_revoked',
                'Текущую сессию из списка устройств завершить нельзя.',
            );
        }

        $deleted = DB::table('sessions')
            ->where('user_id', $this->user($request)->id)
            ->where('id', $session)
            ->delete();

        abort_if($deleted === 0, 404);

        return response()->noContent();
    }

    public function logoutOthers(Request $request): Response
    {
        DB::table('sessions')
            ->where('user_id', $this->user($request)->id)
            ->where('id', '!=', $request->session()->getId())
            ->delete();

        return response()->noContent();
    }

    private function user(Request $request): User
    {
        $user = $request->user();
        assert($user instanceof User);

        return $user;
    }
}
