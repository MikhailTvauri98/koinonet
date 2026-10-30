<?php

declare(strict_types=1);

namespace App\Modules\Chat\Listeners;

use App\Modules\Chat\Actions\CreateMinistryChat;
use App\Modules\Directory\Events\UserCreated;
use App\Modules\Directory\Models\User;
use App\Modules\Ministries\Models\Ministry;
use Illuminate\Contracts\Queue\ShouldQueueAfterCommit;

final readonly class AddNewUserToChats implements ShouldQueueAfterCommit
{
    public function __construct(private CreateMinistryChat $create) {}

    public function handle(UserCreated $event): void
    {
        $user = User::query()->where('person_id', $event->personId)->whereNull('disabled_at')
            ->whereHas('person', fn ($query) => $query->whereNull('archived_at'))->find($event->userId);
        if ($user === null) {
            return;
        }
        foreach (Ministry::query()->whereNull('archived_at')->whereHas('members', fn ($query) => $query->where('person_id', $user->person_id))->cursor() as $ministry) {
            $this->create->handle($ministry);
        }
    }
}
