<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Controllers;

use App\Modules\Chat\Actions\AddGroupMembers;
use App\Modules\Chat\Actions\LeaveGroup;
use App\Modules\Chat\Actions\RemoveGroupMember;
use App\Modules\Chat\Http\Requests\AddMembersRequest;
use App\Modules\Chat\Http\Resources\ChatResource;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\UnreadCounter;
use App\Modules\Directory\Models\User;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ChatMemberController
{
    public function store(AddMembersRequest $request, Chat $chat, AddGroupMembers $action): ChatResource
    {
        $actor = $request->user();
        assert($actor instanceof User);
        /** @var list<string> $ids */
        $ids = $request->validated('user_ids');

        return $this->resource($action->handle($actor, $chat, $ids), $actor);
    }

    public function destroy(Request $request, Chat $chat, string $userId, RemoveGroupMember $action): ChatResource
    {
        $actor = $request->user();
        assert($actor instanceof User);

        return $this->resource($action->handle($actor, $chat, $userId), $actor);
    }

    public function leave(Request $request, Chat $chat, LeaveGroup $action): Response
    {
        $actor = $request->user();
        assert($actor instanceof User);
        $action->handle($actor, $chat);

        return response()->noContent();
    }

    private function resource(Chat $chat, User $actor): ChatResource
    {
        return new ChatResource($chat, app(UnreadCounter::class)->forChat($actor, $chat));
    }
}
