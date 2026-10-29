<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Actions;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\PushSubscription;
use App\Support\DomainRuleException;

final readonly class DeletePushSubscription
{
    public function handle(User $user, string $endpoint): void
    {
        $deleted = PushSubscription::query()->where('user_id', $user->id)->where('endpoint', $endpoint)->delete();

        if ($deleted === 0) {
            throw DomainRuleException::because('push.subscription_not_found', 'Подписка на пуши не найдена.');
        }
    }
}
