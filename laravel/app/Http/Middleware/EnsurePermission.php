<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsurePermission
{
    public function handle(Request $request, Closure $next, string $permission): Response
    {
        $user = $request->user();

        abort_unless(
            $user instanceof User && $user->hasPermissionTo($permission),
            403,
            'You are not authorized to perform this operation.'
        );

        return $next($request);
    }
}
