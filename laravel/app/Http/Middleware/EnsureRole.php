<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        $user = $request->user();

        abort_unless(
            $user instanceof User && $user->isActive() && $user->hasRole(...$roles),
            403,
            'Your account does not have the required role.'
        );

        return $next($request);
    }
}
