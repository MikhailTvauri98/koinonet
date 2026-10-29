<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Controllers;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Actions\DeletePushSubscription;
use App\Modules\Notifications\Actions\SavePushSubscription;
use App\Modules\Notifications\Http\Requests\DeletePushSubscriptionRequest;
use App\Modules\Notifications\Http\Requests\StorePushSubscriptionRequest;
use Illuminate\Http\Response;

final readonly class PushSubscriptionController
{
    public function store(StorePushSubscriptionRequest $request, SavePushSubscription $action): Response
    {
        $user = $request->user();
        assert($user instanceof User);
        $action->handle($user, $request->string('endpoint')->toString(), $request->string('keys.p256dh')->toString(),
            $request->string('keys.auth')->toString(), $request->string('content_encoding', 'aes128gcm')->toString(),
            $request->userAgent());

        return response()->noContent(201);
    }

    public function destroy(DeletePushSubscriptionRequest $request, DeletePushSubscription $action): Response
    {
        $user = $request->user();
        assert($user instanceof User);
        $action->handle($user, $request->string('endpoint')->toString());

        return response()->noContent();
    }
}
