<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\Push\MinishlinkPushTransport;
use App\Modules\Notifications\Push\PushTransport;
use App\Modules\Notifications\Push\WebPushSender;
use GuzzleHttp\Psr7\Response;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Minishlink\WebPush\VAPID;
use Psr\Http\Client\ClientInterface;
use Psr\Http\Message\RequestInterface;
use Psr\Http\Message\ResponseInterface;

uses(RefreshDatabase::class);

beforeEach(function () {
    $keys = VAPID::createVapidKeys();
    config(['webpush.vapid' => [
        'subject' => 'mailto:admin@example.com', 'public_key' => $keys['publicKey'], 'private_key' => $keys['privateKey'],
    ]]);
    $this->publicKey = $keys['publicKey'];
    $this->authToken = rtrim(strtr(base64_encode(random_bytes(16)), '+/', '-_'), '=');
    $this->http = new class implements ClientInterface
    {
        /** @var list<RequestInterface> */
        public array $requests = [];

        public ?Throwable $exception = null;

        public function sendRequest(RequestInterface $request): ResponseInterface
        {
            $this->requests[] = $request;

            if ($this->exception !== null) {
                throw $this->exception;
            }

            return new Response(201);
        }
    };
    $this->transport = new MinishlinkPushTransport($this->http);
    app()->instance(PushTransport::class, $this->transport);
});

it('counts malformed stored subscriptions and still encrypts delivery to a healthy device', function (string $invalid) {
    $user = User::factory()->create();
    $badKeys = match ($invalid) {
        'accepted sample' => ['public_key' => 'BPUBLIC', 'auth_token' => 'AUTH'],
        'invalid base64' => ['public_key' => '%%%'],
        'off curve point' => ['public_key' => rtrim(strtr(base64_encode("\x04".str_repeat("\0", 64)), '+/', '-_'), '=')],
        'wrong auth length' => ['auth_token' => 'AUTH'],
        'invalid auth base64' => ['auth_token' => '%%%'],
    };
    $bad = PushSubscription::factory()->for($user)->create([
        'endpoint' => 'https://push.example/broken', 'public_key' => $this->publicKey,
        'auth_token' => $this->authToken, 'failures' => 8, ...$badKeys,
    ]);
    $healthy = PushSubscription::factory()->for($user)->create([
        'endpoint' => 'https://push.example/healthy', 'public_key' => $this->publicKey, 'auth_token' => $this->authToken,
    ]);

    app(WebPushSender::class)->send($user, ['title' => 'Т', 'body' => 'Б', 'url' => '/a/1', 'tag' => 'a1']);

    expect($bad->fresh()->failures)->toBe(9)->and($healthy->fresh()->last_success_at)->not->toBeNull()
        ->and($this->http->requests)->toHaveCount(1)
        ->and((string) $this->http->requests[0]->getUri())->toBe('https://push.example/healthy')
        ->and($this->http->requests[0]->getHeaderLine('Content-Encoding'))->toBe('aes128gcm')
        ->and($this->http->requests[0]->getHeaderLine('Authorization'))->toStartWith('vapid ')
        ->and((string) $this->http->requests[0]->getBody())->not->toBe('');

    app(WebPushSender::class)->send($user, ['title' => 'Т', 'body' => 'Б', 'url' => '/a/1', 'tag' => 'a1']);
    expect($bad->fresh())->toBeNull()->and($this->http->requests)->toHaveCount(2);
})->with(['accepted sample', 'invalid base64', 'off curve point', 'wrong auth length', 'invalid auth base64']);

it('sends valid browser keys in both supported encodings', function (string $encoding) {
    $sub = PushSubscription::factory()->create([
        'public_key' => $this->publicKey, 'auth_token' => $this->authToken, 'content_encoding' => $encoding,
    ]);

    $result = $this->transport->push($sub, '{}');

    expect($result->success)->toBeTrue()->and($result->status)->toBe(201)
        ->and($this->http->requests)->toHaveCount(1)
        ->and($this->http->requests[0]->getHeaderLine('Content-Encoding'))->toBe($encoding)
        ->and($this->http->requests[0]->getHeaderLine('TTL'))->toBe('86400');
})->with(['aes128gcm', 'aesgcm']);

it('propagates global VAPID configuration errors without counting device failures', function () {
    config(['webpush.vapid.private_key' => null]);
    $user = User::factory()->create();
    $sub = PushSubscription::factory()->for($user)->create(['failures' => 2]);
    app()->instance(PushTransport::class, new MinishlinkPushTransport($this->http));

    expect(fn () => app(WebPushSender::class)->send($user, ['body' => 'Т']))->toThrow(ErrorException::class, '[VAPID]');
    expect($sub->fresh()->failures)->toBe(2)->and($this->http->requests)->toBe([]);
});

it('propagates unexpected HTTP client errors instead of classifying them as bad keys', function () {
    $this->http->exception = new LogicException('Broken HTTP adapter');
    $sub = PushSubscription::factory()->create(['public_key' => $this->publicKey, 'auth_token' => $this->authToken]);

    expect(fn () => $this->transport->push($sub, '{}'))->toThrow(LogicException::class, 'Broken HTTP adapter');
});
