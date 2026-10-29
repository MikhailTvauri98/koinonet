<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\Push\PushResult;
use App\Modules\Notifications\Push\PushTransport;

final class FakePushTransport implements PushTransport
{
    /** @var list<array{endpoint: string, payload: array<string, mixed>}> */
    public array $sent = [];

    /** @var array<string, PushResult> */
    private array $responses = [];

    public function willRespond(string $endpoint, PushResult $result): void
    {
        $this->responses[$endpoint] = $result;
    }

    public function push(PushSubscription $subscription, string $payload): PushResult
    {
        $this->sent[] = ['endpoint' => $subscription->endpoint, 'payload' => json_decode($payload, true, 512, JSON_THROW_ON_ERROR)];

        return $this->responses[$subscription->endpoint] ?? new PushResult(true, 201);
    }
}
