<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Http\Controllers;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Actions\MarkNotificationsRead;
use App\Modules\Notifications\Http\Requests\MarkNotificationsReadRequest;
use App\Modules\Notifications\Http\Resources\NotificationResource;
use Dedoc\Scramble\Attributes\Response as OpenApiResponse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class NotificationCenterController
{
    private const string CENTER_RESPONSE = 'array{data: list<array{id: string, category: string, title: string, body: string, url: string, read_at: string|null, created_at: string|null}>, next_cursor: string|null, meta: array{unread_count: int}}';

    #[OpenApiResponse(type: self::CENTER_RESPONSE)]
    public function index(Request $request): JsonResponse
    {
        $request->validate(['cursor' => ['sometimes', 'string', 'max:2048']]);
        $user = $request->user();
        assert($user instanceof User);
        $notifications = $user->notifications()->reorder()->latest('created_at')->latest('id')->cursorPaginate(30);

        return response()->json([
            'data' => NotificationResource::collection($notifications->items())->resolve($request),
            'next_cursor' => $notifications->nextCursor()?->encode(),
            'meta' => ['unread_count' => $user->unreadNotifications()->count()],
        ]);
    }

    #[OpenApiResponse(type: 'array{unread_count: int}')]
    public function read(MarkNotificationsReadRequest $request, MarkNotificationsRead $action): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);
        /** @var list<string>|null $ids */
        $ids = $request->validated('ids');

        return response()->json(['unread_count' => $action->handle($user, $ids, $request->boolean('all'))]);
    }
}
