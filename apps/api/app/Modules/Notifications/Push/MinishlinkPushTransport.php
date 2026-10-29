<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Push;

use App\Modules\Notifications\Models\PushSubscription;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

final class MinishlinkPushTransport implements PushTransport
{
    private ?WebPush $client = null;

    public function push(PushSubscription $subscription, string $payload): PushResult
    {
        $report = $this->client()->sendOneNotification(
            Subscription::create([
                'endpoint' => $subscription->endpoint,
                'publicKey' => $subscription->public_key,
                'authToken' => $subscription->auth_token,
                'contentEncoding' => $subscription->content_encoding,
            ]),
            $payload,
            ['TTL' => (int) config('webpush.ttl')],
        );

        return new PushResult($report->isSuccess(), $report->getResponse()?->getStatusCode());
    }

    private function client(): WebPush
    {
        return $this->client ??= new WebPush(['VAPID' => [
            'subject' => config('webpush.vapid.subject'),
            'publicKey' => config('webpush.vapid.public_key'),
            'privateKey' => config('webpush.vapid.private_key'),
        ]]);
    }
}
