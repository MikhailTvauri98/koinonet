<?php

declare(strict_types=1);

use Illuminate\Foundation\Testing\RefreshDatabase;

uses(RefreshDatabase::class);

// У API нет экрана входа, он в SPA. Гость получает 401 в JSON независимо от
// заголовка Accept: fetch без тела его не шлёт, а без него Authenticate
// строил бы ссылку на несуществующий маршрут `login` и падал с 500.
it('answers a guest on a protected endpoint with 401 JSON, not a redirect or 500', function (array $headers) {
    $response = $this->withHeaders($headers)->get('/api/v1/auth/me');

    $response->assertStatus(401)->assertExactJson(['message' => 'Требуется вход.']);
    expect($response->headers->get('Location'))->toBeNull();
})->with([
    'no Accept header set by the caller' => [[]],
    'fetch default Accept' => [['Accept' => '*/*']],
    'stateful SPA request without Accept' => [['Origin' => 'http://localhost']],
]);
