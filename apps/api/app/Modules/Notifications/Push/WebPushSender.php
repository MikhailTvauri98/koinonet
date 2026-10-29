<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Push;

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Actions\RecordPushDelivery;
use App\Modules\Notifications\Models\PushSubscription;
use LengthException;

final readonly class WebPushSender
{
    public function __construct(private PushTransport $transport, private RecordPushDelivery $recordDelivery) {}

    /** @param array<string, mixed> $payload */
    public function send(User $user, array $payload): void
    {
        if (isset($payload['body']) && is_string($payload['body']) && mb_strlen($payload['body']) > 140) {
            $payload['body'] = mb_substr($payload['body'], 0, 139).'…';
        }

        $json = json_encode($payload, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);

        if (strlen($json) > 3072) {
            throw new LengthException('Web Push payload exceeds 3 KiB.');
        }

        foreach (PushSubscription::query()->where('user_id', $user->id)->get() as $subscription) {
            $this->recordDelivery->handle($subscription, $this->transport->push($subscription, $json));
        }
    }
}
