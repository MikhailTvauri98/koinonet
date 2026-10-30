<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Controllers;

use App\Modules\Chat\Actions\SendMessage;
use App\Modules\Chat\Http\Requests\MessageHistoryRequest;
use App\Modules\Chat\Http\Requests\SendMessageRequest;
use App\Modules\Chat\Http\Resources\MessageResource;
use App\Modules\Chat\MessageCursor;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class MessageController
{
    /** @return array{data: AnonymousResourceCollection, next_before: string|null, next_after: string|null} */
    public function index(MessageHistoryRequest $request, Chat $chat): array
    {
        $before = $request->validated('before');
        $after = $request->validated('after');
        $query = $chat->messages()->with(['sender.person.photo', 'replyTo.sender.person', 'attachments.media']);
        if ($before !== null || $after !== null) {
            $cursor = MessageCursor::decode($before ?? $after);
            $query->whereRaw('(created_at, id) '.($before !== null ? '<' : '>').' (?, ?)', [
                $cursor['created_at']->format('Y-m-d H:i:s.u'), $cursor['id'],
            ]);
        }
        $ascending = $after !== null;
        $messages = $query->orderBy('created_at', $ascending ? 'asc' : 'desc')->orderBy('id', $ascending ? 'asc' : 'desc')
            ->limit((int) $request->validated('limit', 50))->get();
        if (! $ascending) {
            $messages = $messages->reverse()->values();
        }
        $first = $messages->first();
        $last = $messages->last();

        return [
            'data' => MessageResource::collection($messages),
            'next_before' => $first !== null && $chat->messages()->whereRaw('(created_at, id) < (?, ?)', [$first->created_at->format('Y-m-d H:i:s.u'), $first->id])->exists() ? MessageCursor::encode($first) : null,
            'next_after' => $last !== null && $chat->messages()->whereRaw('(created_at, id) > (?, ?)', [$last->created_at->format('Y-m-d H:i:s.u'), $last->id])->exists() ? MessageCursor::encode($last) : null,
        ];
    }

    public function store(SendMessageRequest $request, Chat $chat, SendMessage $send): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);
        $message = $send->handle($user, $chat, $request->validated('body'), $request->validated('media_ids', []), $request->validated('reply_to_id'));

        return (new MessageResource($message))->response()->setStatusCode(201);
    }
}
