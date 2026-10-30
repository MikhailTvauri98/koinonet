<?php

declare(strict_types=1);

namespace App\Modules\Chat\Http\Controllers;

use App\Modules\Chat\Actions\MuteChat;
use App\Modules\Chat\Actions\UnmuteChat;
use App\Modules\Chat\Http\Requests\MuteRequest;
use App\Modules\Chat\Http\Resources\ChatResource;
use App\Modules\Chat\Models\Chat;
use App\Modules\Chat\UnreadCounter;
use App\Modules\Directory\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

final class MuteController
{
    public function store(MuteRequest $request, Chat $chat, MuteChat $mute, UnreadCounter $unread): ChatResource
    {
        $user = $request->user();
        assert($user instanceof User);
        $until = $request->validated('until');
        $mute->handle($user, $chat, is_string($until) ? CarbonImmutable::parse($until)->utc() : null);

        $chat->refresh()->load(['ministry', 'event', 'avatar', 'members.user.person.photo', 'lastMessage']);

        return new ChatResource($chat, $unread->forChat($user, $chat));
    }

    public function destroy(Request $request, Chat $chat, UnmuteChat $unmute, UnreadCounter $unread): ChatResource
    {
        $user = $request->user();
        assert($user instanceof User);
        $unmute->handle($user, $chat);

        $chat->refresh()->load(['ministry', 'event', 'avatar', 'members.user.person.photo', 'lastMessage']);

        return new ChatResource($chat, $unread->forChat($user, $chat));
    }
}
