<?php

declare(strict_types=1);

use App\Modules\Directory\Models\User;
use App\Modules\Notifications\Channels\WebPushChannel;
use App\Modules\Notifications\Models\NotificationSetting;
use App\Modules\Notifications\Models\PushSubscription;
use App\Modules\Notifications\Push\PushResult;
use App\Modules\Notifications\Push\PushTransport;
use App\Modules\Notifications\Push\WebPushSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Support\FakePushTransport;
use Tests\Support\PushSample;

uses(RefreshDatabase::class);

beforeEach(function () {
    $this->transport = new FakePushTransport;
    app()->instance(PushTransport::class, $this->transport);
});

it('sends the payload to every subscription of the account', function () {
    $user = User::factory()->create();
    PushSubscription::factory()->for($user)->create(['endpoint' => 'https://push.example/1']);
    PushSubscription::factory()->for($user)->create(['endpoint' => 'https://push.example/2']);
    PushSubscription::factory()->for(User::factory()->create())->create(['endpoint' => 'https://push.example/foreign']);

    app(WebPushChannel::class)->send($user, new PushSample);

    expect($this->transport->sent)->toHaveCount(2)
        ->and($this->transport->sent[0]['payload'])->toMatchArray([
            'title' => 'Собрание', 'tag' => 'announcement-a1', 'url' => '/announcements/a1',
        ])
        ->and($this->transport->sent[0]['payload'])->toHaveKey('icon');
});

it('records the success and resets the failure counter', function () {
    $user = User::factory()->create();
    $sub = PushSubscription::factory()->for($user)->create(['failures' => 4]);

    app(WebPushChannel::class)->send($user, new PushSample);

    expect($sub->fresh()->failures)->toBe(0)->and($sub->fresh()->last_success_at)->not->toBeNull();
});

it('deletes a subscription after 404 or 410', function (int $status) {
    $user = User::factory()->create();
    $sub = PushSubscription::factory()->for($user)->create(['endpoint' => "https://push.example/{$status}"]);
    $this->transport->willRespond($sub->endpoint, new PushResult(false, $status));

    app(WebPushChannel::class)->send($user, new PushSample);

    expect(PushSubscription::query()->find($sub->id))->toBeNull();
})->with([404, 410]);

it('counts other failures and deletes on the tenth', function () {
    $user = User::factory()->create();
    $sub = PushSubscription::factory()->for($user)->create(['failures' => 8]);
    $this->transport->willRespond($sub->endpoint, new PushResult(false, 500));

    app(WebPushChannel::class)->send($user, new PushSample);
    expect($sub->fresh()->failures)->toBe(9);

    app(WebPushChannel::class)->send($user, new PushSample);
    expect(PushSubscription::query()->find($sub->id))->toBeNull();
});

it('includes webpush in via only when the category is on and a subscription exists', function () {
    $user = User::factory()->create();
    expect((new PushSample)->via($user))->not->toContain(WebPushChannel::class);

    PushSubscription::factory()->for($user)->create();
    expect((new PushSample)->via($user))->toContain(WebPushChannel::class);

    NotificationSetting::query()->create(['user_id' => $user->id, 'category' => 'announcements', 'enabled' => false]);
    expect((new PushSample)->via($user))->not->toContain(WebPushChannel::class);
});

it('keeps the payload under three kilobytes', function () {
    $user = User::factory()->create();
    PushSubscription::factory()->for($user)->create();
    $long = new class extends PushSample
    {
        public function body(): string
        {
            return str_repeat('очень длинный текст ', 500);
        }
    };

    app(WebPushChannel::class)->send($user, $long);

    expect(strlen(json_encode($this->transport->sent[0]['payload'], JSON_THROW_ON_ERROR)))->toBeLessThan(3072);
    expect(mb_strlen($this->transport->sent[0]['payload']['body']))->toBeLessThanOrEqual(140);
});

it('counts network failures and continues delivering to other devices', function () {
    $user = User::factory()->create();
    $failed = PushSubscription::factory()->for($user)->create(['endpoint' => 'https://push.example/failed']);
    $healthy = PushSubscription::factory()->for($user)->create();
    $this->transport->willRespond($failed->endpoint, new PushResult(false, null));

    app(WebPushChannel::class)->send($user, new PushSample);

    expect($failed->fresh()->failures)->toBe(1)->and($healthy->fresh()->last_success_at)->not->toBeNull()
        ->and($this->transport->sent)->toHaveCount(2);
});

it('resets the consecutive sequence on success', function () {
    $user = User::factory()->create();
    $sub = PushSubscription::factory()->for($user)->create(['failures' => 9]);
    app(WebPushChannel::class)->send($user, new PushSample);
    $this->transport->willRespond($sub->endpoint, new PushResult(false, 503));
    app(WebPushChannel::class)->send($user, new PushSample);
    expect($sub->fresh()->failures)->toBe(1);
});

it('rejects oversized encoded payloads without delivery or failure changes', function () {
    $user = User::factory()->create();
    $sub = PushSubscription::factory()->for($user)->create(['failures' => 2]);
    $long = new class extends PushSample
    {
        public function title(): string
        {
            return str_repeat('字', 2000);
        }
    };

    expect(fn () => app(WebPushChannel::class)->send($user, $long))->toThrow(LengthException::class);
    expect($this->transport->sent)->toBe([])->and($sub->fresh()->failures)->toBe(2);
});

it('bounds direct sender bodies and measures actual encoded bytes', function () {
    $user = User::factory()->create();
    PushSubscription::factory()->for($user)->create();
    app(WebPushSender::class)->send($user, [
        'title' => 'Т', 'body' => str_repeat('字', 500), 'url' => '/a/1', 'tag' => 'a1',
    ]);
    expect(mb_strlen($this->transport->sent[0]['payload']['body']))->toBe(140)
        ->and(strlen(json_encode($this->transport->sent[0]['payload'], JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)))
        ->toBeLessThanOrEqual(3072);
});
