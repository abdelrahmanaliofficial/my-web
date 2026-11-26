<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use App\Http\Middleware\EnsureActiveAccountSession;
use App\Http\Middleware\EnsurePermission;
use App\Http\Middleware\EnsureRole;

$trustedProxies = array_values(array_filter(array_map(
    'trim',
    explode(',', (string) env('TRUSTED_PROXIES', '127.0.0.1,::1'))
)));

if ($trustedProxies === []) {
    $trustedProxies = ['127.0.0.1'];
}

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__ . '/../routes/web.php',
        api: __DIR__ . '/../routes/api.php',
        commands: __DIR__ . '/../routes/console.php',
        health: '/up',
    )
    ->withCommands([__DIR__ . '/../app/Console/Commands'])
    ->withMiddleware(function (Middleware $middleware) use ($trustedProxies): void {
        // Enables cookie-based Sanctum authentication for configured stateful frontend domains.
        $middleware->statefulApi();

        $middleware->alias([
            'account.active' => EnsureActiveAccountSession::class,
            'permission' => EnsurePermission::class,
            'role' => EnsureRole::class,
        ]);

        $middleware->trustProxies(
            at: $trustedProxies,
            headers: Request::HEADER_X_FORWARDED_FOR
                | Request::HEADER_X_FORWARDED_HOST
                | Request::HEADER_X_FORWARDED_PORT
                | Request::HEADER_X_FORWARDED_PROTO
        );
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Laravel's default exception handling is retained. API requests negotiate JSON via Accept header.
    })
    ->create();