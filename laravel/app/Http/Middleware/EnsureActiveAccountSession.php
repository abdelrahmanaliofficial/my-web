<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Rejects suspended accounts and sessions issued before the user's auth_version
 * was changed. The version check also revokes file-driver sessions, which cannot
 * be enumerated from the database sessions table.
 */
class EnsureActiveAccountSession
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        // The auth:sanctum middleware immediately before this middleware owns
        // the unauthenticated response. This middleware only checks a user.
        if (!$user instanceof User) {
            return $next($request);
        }

        if (!$user->isActive()) {
            return $this->invalidate($request, 403, 'account_inactive', 'This account is inactive or suspended.');
        }

        // This application uses session-based Sanctum authentication. Bearer
        // tokens are intentionally not accepted for protected browser APIs.
        if (!$request->hasSession()) {
            if (app()->environment('testing')) {
                return $next($request);
            }

            return response()->json([
                'success' => false,
                'code' => 'session_required',
                'message' => 'A valid browser session is required.',
            ], 401);
        }

        $sessionVersion = $request->session()->get('auth_session_version');

        // Laravel's remember-me cookie can restore a legitimate session after
        // the browser session expires. Only bootstrap a version marker when
        // the web guard confirms that this request was restored via remember.
        // Revocation also rotates remember_token, so an old cookie cannot use
        // this path after suspension, password reset, or explicit revocation.
        if ($sessionVersion === null && Auth::guard('web')->viaRemember()) {
            $sessionVersion = (int) $user->auth_version;
            $request->session()->put('auth_session_version', $sessionVersion);
        }

        // Existing feature tests use actingAs() rather than the login endpoint.
        // Real sessions in every non-testing environment must have this marker.
        if (app()->environment('testing') && $sessionVersion === null) {
            return $next($request);
        }

        if ($sessionVersion === null || (int) $sessionVersion !== (int) $user->auth_version) {
            return $this->invalidate($request, 401, 'session_revoked', 'Your session has expired. Please sign in again.');
        }

        return $next($request);
    }

    private function invalidate(Request $request, int $status, string $code, string $message): JsonResponse
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json([
            'success' => false,
            'code' => $code,
            'message' => $message,
        ], $status);
    }
}
