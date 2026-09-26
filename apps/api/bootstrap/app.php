<?php

declare(strict_types=1);

use App\Support\DomainRuleException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        $exceptions->render(
            fn (DomainRuleException $exception): JsonResponse => response()->json([
                'message' => $exception->getMessage(),
                'code' => $exception->ruleCode,
            ], 422),
        );
    })->create();
