<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Controllers;

use App\Modules\Directory\AccessLinkKind;
use App\Modules\Directory\Actions\AcceptAccessLink;
use App\Modules\Directory\Http\Requests\AcceptAccessLinkRequest;
use App\Modules\Directory\Http\Resources\AccessLinkResource;
use App\Modules\Directory\Http\Resources\MeResource;
use App\Modules\Directory\Models\AccessLink;
use App\Support\DomainRuleException;
use Illuminate\Http\JsonResponse;

final class AccessLinkController
{
    public function show(string $token): AccessLinkResource
    {
        $link = AccessLink::findByPlainToken($token);

        if ($link === null) {
            throw DomainRuleException::because('access_link.invalid', 'Ссылка недействительна.');
        }

        $link->ensureUsable();

        return new AccessLinkResource($link->load('person'));
    }

    public function accept(
        AcceptAccessLinkRequest $request,
        string $token,
        AcceptAccessLink $acceptAccessLink,
    ): JsonResponse {
        /** @var array{login?: string, password: string} $validated */
        $validated = $request->validated();
        $result = $acceptAccessLink->handle($token, $validated);

        if ($result['kind'] === AccessLinkKind::Invite) {
            $user = $result['user'];
            assert($user !== null);

            return (new MeResource($user->load('person')))->response()->setStatusCode(201);
        }

        return response()->json(['data' => ['kind' => AccessLinkKind::PasswordReset->value]]);
    }
}
