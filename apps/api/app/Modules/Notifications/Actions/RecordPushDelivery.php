<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Actions;

use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\Push\PushResult;
use Illuminate\Support\Facades\DB;

final readonly class RecordPushDelivery
{
    public function handle(PushSubscription $subscription, PushResult $result): void
    {
        DB::transaction(function () use ($subscription, $result): void {
            $current = PushSubscription::query()->whereKey($subscription->id)
                ->where('user_id', $subscription->user_id)->lockForUpdate()->first();

            if ($current === null) {
                return;
            }

            if ($result->success) {
                $current->forceFill(['failures' => 0, 'last_success_at' => now()])->save();
            } elseif (in_array($result->status, [404, 410], true)
                || $current->failures + 1 >= (int) config('webpush.max_failures')) {
                $current->delete();
            } else {
                $current->increment('failures');
            }
        });
    }
}
