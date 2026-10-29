<?php

declare(strict_types=1);

namespace App\Modules\Notifications\Push;

use App\Modules\Notifications\Models\PushSubscription;
use Base64Url\Base64Url;
use Jose\Component\Core\JWK;
use Jose\Component\Core\Util\ECKey;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Psr\Http\Client\ClientInterface;

final class MinishlinkPushTransport implements PushTransport
{
    private ?WebPush $client = null;

    public function __construct(private readonly ?ClientInterface $httpClient = null) {}

    public function push(PushSubscription $subscription, string $payload): PushResult
    {
        // Global VAPID configuration errors must still fail the job rather
        // than count against every device's subscription.
        $client = $this->client();

        if (! $this->hasUsableKeys($subscription)) {
            return new PushResult(false, null);
        }

        $report = $client->sendOneNotification(
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

    private function hasUsableKeys(PushSubscription $subscription): bool
    {
        $publicKey = base64_decode(strtr($subscription->public_key, '-_', '+/'), true);
        $authToken = base64_decode(strtr($subscription->auth_token, '-_', '+/'), true);

        if ($publicKey === false || strlen($publicKey) !== 65 || $publicKey[0] !== "\x04"
            || $authToken === false || strlen($authToken) !== 16) {
            return false;
        }

        // Length alone does not establish that the browser's uncompressed
        // point lies on P-256; OpenSSL imports and validates the point.
        $key = new JWK([
            'kty' => 'EC', 'crv' => 'P-256',
            'x' => Base64Url::encode(substr($publicKey, 1, 32)),
            'y' => Base64Url::encode(substr($publicKey, 33, 32)),
        ]);

        return openssl_pkey_get_public(ECKey::convertPublicKeyToPEM($key)) !== false;
    }

    private function client(): WebPush
    {
        return $this->client ??= new WebPush(['VAPID' => [
            'subject' => config('webpush.vapid.subject'),
            'publicKey' => config('webpush.vapid.public_key'),
            'privateKey' => config('webpush.vapid.private_key'),
        ]], client: $this->httpClient);
    }
}
