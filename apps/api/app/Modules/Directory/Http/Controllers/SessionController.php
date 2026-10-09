<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Controllers;

use App\Modules\Directory\Actions\EndDevice;
use App\Modules\Directory\Actions\EndOtherDevices;
use App\Modules\Directory\Http\Resources\SessionResource;
use App\Modules\Directory\Models\User;
use Illuminate\Auth\SessionGuard;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Auth;
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

    public function destroy(Request $request, string $session, EndDevice $endDevice): Response
    {
        $user = $this->user($request);
        $ended = $endDevice->handle($user, $session, $request->session()->getId());

        abort_unless($ended, 404);

        $this->keepThisDeviceRemembered($request, $user);

        return response()->noContent();
    }

    public function logoutOthers(Request $request, EndOtherDevices $endOtherDevices): Response
    {
        $user = $this->user($request);
        $endOtherDevices->handle($user, $request->session()->getId());

        $this->keepThisDeviceRemembered($request, $user);

        return response()->noContent();
    }

    /**
     * Ending another device gives the account a new remember token, which also voids
     * the "remember me" cookie of the device that asked. That device stays the one
     * it was, so it gets its cookie back under the new token.
     */
    private function keepThisDeviceRemembered(Request $request, User $user): void
    {
        $guard = Auth::guard('web');
        assert($guard instanceof SessionGuard);

        if ($request->cookies->has($guard->getRecallerName())) {
            $guard->login($user, remember: true);
        }
    }

    private function user(Request $request): User
    {
        $user = $request->user();
        assert($user instanceof User);

        return $user;
    }
}
