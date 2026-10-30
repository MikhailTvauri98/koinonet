<?php

declare(strict_types=1);

namespace App\Modules\Chat\Actions;

use App\Modules\Chat\ChatType;
use App\Modules\Chat\Models\Chat;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Support\Facades\DB;

final readonly class CreateMinistryChat
{
    public function __construct(private SyncMinistryChatMember $members) {}

    public function handle(Ministry $ministry): Chat
    {
        return DB::transaction(function () use ($ministry): Chat {
            $chat = Chat::query()->firstOrCreate(['ministry_id' => $ministry->id], ['type' => ChatType::Ministry]);
            foreach (User::query()->whereIn('person_id', $ministry->members()->select('person_id'))
                ->whereNull('disabled_at')->whereHas('person', fn ($query) => $query->whereNull('archived_at'))->cursor() as $user) {
                $this->members->add($chat, $user);
            }

            return $chat;
        });
    }
}
