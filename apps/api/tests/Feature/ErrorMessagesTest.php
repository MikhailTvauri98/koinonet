<?php

declare(strict_types=1);

use App\Modules\Access\Permission;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;

uses(RefreshDatabase::class);

it('explains a validation failure in Russian, field by field', function () {
    actingAsUserWith([Permission::PeopleManage]);

    $this->postJson('/api/v1/people', ['email' => 'not-an-email'])
        ->assertStatus(422)
        ->assertJsonPath('errors.last_name.0', 'Поле «фамилия» обязательно для заполнения.')
        ->assertJsonPath('errors.email.0', 'Поле «почта» должно быть адресом электронной почты.')
        ->assertJsonPath('message', 'Поле «фамилия» обязательно для заполнения. (и ещё 3 ошибки)');
});

it('answers a missing record without naming the model class', function () {
    actingAsAdministrator();

    $response = $this->getJson('/api/v1/ministries/01JQZ0000000000000000000ZZ');

    $response->assertNotFound()->assertExactJson(['message' => 'Запись не найдена.']);
    expect($response->getContent())->not->toContain('App\\\\');
});

it('answers a server error in production with a general message only', function () {
    config(['app.debug' => false]);
    Route::get('/api/v1/__test/failure', fn () => throw new RuntimeException('App\\Modules\\Secret broke'));

    $response = $this->getJson('/api/v1/__test/failure');

    $response->assertStatus(500)->assertExactJson(['message' => 'Ошибка сервера. Попробуйте позже.']);
});

it('answers a forbidden action in Russian', function () {
    actingAsUser();

    $this->getJson('/api/v1/audit')->assertForbidden()->assertExactJson(['message' => 'Нет права на это действие.']);
});

it('answers too many login attempts in Russian and says when to retry', function () {
    config(['cache.limiter' => 'array']);

    foreach (range(1, 10) as $attempt) {
        $this->postJson('/api/v1/auth/login', ['login' => 'nobody@example.com', 'password' => 'wrong'])
            ->assertStatus(422);
    }

    $this->postJson('/api/v1/auth/login', ['login' => 'nobody@example.com', 'password' => 'wrong'])
        ->assertStatus(429)
        ->assertHeader('Retry-After')
        ->assertExactJson(['message' => 'Слишком много попыток. Подождите минуту.']);
});
