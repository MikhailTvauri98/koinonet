<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Listeners;

use App\Modules\Directory\Events\UserDisabled;
use App\Modules\Notifications\Actions\RemoveAccountPushSubscriptions;
use Illuminate\Contracts\Queue\ShouldQueue;

final readonly class RemovePushSubscriptionsOnDisable implements ShouldQueue
{
    public function __construct(private RemoveAccountPushSubscriptions $action) {}

    public function handle(UserDisabled $event): void
    {
        $this->action->handle($event->userId);
    }
}
