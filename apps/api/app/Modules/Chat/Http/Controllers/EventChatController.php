<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Controllers;

use App\Modules\Calendar\Models\Event;
use App\Modules\Chat\Actions\CreateEventChat;
use App\Modules\Chat\Http\Resources\ChatResource;
use App\Modules\Chat\UnreadCounter;
use App\Modules\Directory\Models\User;
use Dedoc\Scramble\Attributes\Response as OpenApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class EventChatController
{
    #[OpenApiResponse(status: 200, type: 'array{data: ChatResource}')]
    #[OpenApiResponse(status: 201, type: 'array{data: ChatResource}')]
    public function store(Request $request, Event $event, CreateEventChat $action, UnreadCounter $unread): JsonResponse
    {
        $actor = $request->user();
        assert($actor instanceof User);
        $result = $action->handle($event, $actor);

        return (new ChatResource($result['chat'], $unread->forChat($actor, $result['chat'])))
            ->response()->setStatusCode($result['created'] ? 201 : 200);
    }
}
