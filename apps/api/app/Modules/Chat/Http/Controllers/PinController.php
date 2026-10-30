<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Controllers;

use App\Modules\Chat\Actions\PinMessage;
use App\Modules\Chat\Actions\UnpinMessage;
use App\Modules\Chat\Http\Resources\MessageResource;
use App\Modules\Chat\Models\Message;
use App\Modules\Chat\PinnedMessages;
use App\Modules\Directory\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class PinController
{
    public function store(Request $request, Message $message, PinMessage $pin, PinnedMessages $pins): AnonymousResourceCollection
    {
        $actor = $request->user();
        assert($actor instanceof User);
        $pin->handle($message, $actor);

        return MessageResource::collection($pins->forChat($message->chat_id));
    }

    public function destroy(Request $request, Message $message, UnpinMessage $unpin, PinnedMessages $pins): AnonymousResourceCollection
    {
        $actor = $request->user();
        assert($actor instanceof User);
        $unpin->handle($message, $actor);

        return MessageResource::collection($pins->forChat($message->chat_id));
    }
}
