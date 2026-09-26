<?php

declare(strict_types=1);

use App\Support\DomainRuleException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        // Экран входа живёт в SPA, у API его нет, поэтому гостя некуда
        // перенаправлять. По умолчанию Authenticate::unauthenticated() для
        // запроса без Accept: application/json ещё при создании
        // AuthenticationException зовёт redirectTo(), то есть route('login');
        // такого маршрута нет, и вместо AuthenticationException вылетает
        // RouteNotFoundException — обработчик отдаёт её как 500 («Route [login]
        // not defined.»), до 401 дело не доходит. Без адреса перенаправления
        // AuthenticationException доходит до обработчика, и тот отвечает на
        // api/* — а других защищённых маршрутов нет — 401 в JSON.
        $middleware->redirectGuestsTo(fn (): ?string => null);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $rendersJson = fn (Request $request): bool => $request->is('api/*') || $request->expectsJson();

        $exceptions->shouldRenderJsonWhen($rendersJson);
        $exceptions->render(
            fn (DomainRuleException $exception): JsonResponse => response()->json([
                'message' => $exception->getMessage(),
                'code' => $exception->ruleCode,
            ], 422),
        );
        // The framework's texts for these statuses are English, and a 404 from
        // route-model binding names the model class ("No query results for
        // model [App\Modules\...]"), as does the debug body of any error. The
        // client gets a plain Russian sentence instead; headers such as
        // Retry-After stay. A server error keeps its details while debugging.
        $exceptions->respond(function (Response $response, Throwable $exception, Request $request) use ($rendersJson): Response {
            if (! $rendersJson($request) || ! $response instanceof JsonResponse) {
                return $response;
            }

            $status = $response->getStatusCode();
            $message = match (true) {
                $status === 401 => 'Требуется вход.',
                $status === 403 => 'Нет права на это действие.',
                $status === 404 => 'Запись не найдена.',
                $status === 429 => 'Слишком много попыток. Подождите минуту.',
                $status >= 500 && ! config('app.debug') => 'Ошибка сервера. Попробуйте позже.',
                default => null,
            };

            return $message === null ? $response : $response->setData(['message' => $message]);
        });
    })->create();
