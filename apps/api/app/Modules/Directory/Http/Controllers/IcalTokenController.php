<?php

declare(strict_types=1);

namespace App\Modules\Directory\Http\Controllers;

use App\Modules\Directory\Actions\RotateIcalToken;
use App\Modules\Directory\Http\Resources\IcalTokenResource;
use App\Modules\Directory\Models\User;
use Illuminate\Http\Request;

final class IcalTokenController
{
    public function rotate(Request $request, RotateIcalToken $rotate): IcalTokenResource
    {
        $user = $request->user();
        assert($user instanceof User);

        return new IcalTokenResource($rotate->handle($user));
    }
}
