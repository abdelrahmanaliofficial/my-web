<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules\Password as PasswordRule;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'email' => ['required', 'email:rfc', 'max:255'],
            'password' => ['required', 'string', 'max:1024'],
            'remember' => ['sometimes', 'boolean'],
        ]);

        $email = Str::lower(trim($validated['email']));
        $user = User::query()->whereRaw('LOWER(email) = ?', [$email])->first();

        if (!$user || !Hash::check($validated['password'], $user->password)) {
            return response()->json([
                'success' => false,
                'code' => 'invalid_credentials',
                'message' => 'The provided credentials are incorrect.',
            ], 422);
        }

        if (!$user->isActive()) {
            return response()->json([
                'success' => false,
                'code' => 'account_inactive',
                'message' => 'This account is inactive or suspended.',
            ], 403);
        }

        if (config('auth.require_verified_email') && !$user->hasVerifiedEmail()) {
            // Sending is rate-limited by the login route and only occurs after
            // valid credentials have been supplied.
            $user->sendEmailVerificationNotification();

            return response()->json([
                'success' => false,
                'code' => 'email_verification_required',
                'message' => 'Verify your email address before signing in. A verification link has been sent.',
            ], 403);
        }

        if (!$request->hasSession()) {
            return response()->json([
                'success' => false,
                'code' => 'stateful_session_required',
                'message' => 'Sign-in must be initiated from the configured first-party website origin.',
            ], 419);
        }

        Auth::guard('web')->login($user, (bool) ($validated['remember'] ?? false));
        $request->session()->regenerate();
        $request->session()->put('auth_session_version', (int) $user->auth_version);

        $user->forceFill(['last_login_at' => now()])->save();

        return response()->json([
            'success' => true,
            'message' => 'Authenticated successfully.',
            'data' => $user->fresh()->toSafeArray(),
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User && $user->isActive(), 401);

        return response()->json(['success' => true, 'data' => $user->toSafeArray()]);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(['success' => true, 'message' => 'Logged out successfully.']);
    }

    public function updatePassword(Request $request): JsonResponse
    {
        $user = $request->user();
        abort_unless($user instanceof User && $user->isActive(), 401);

        $validated = $request->validate([
            'current_password' => ['required', 'current_password:web'],
            'password' => ['required', 'confirmed', PasswordRule::min(12)->letters()->numbers()],
        ]);

        $newAuthVersion = ((int) $user->auth_version) + 1;
        $user->forceFill([
            'password' => Hash::make($validated['password']),
            'remember_token' => Str::random(60),
            'auth_version' => $newAuthVersion,
        ])->save();

        // Revoke personal access tokens as an additional safeguard. Browser
        // sessions are invalidated by auth_version even with SESSION_DRIVER=file.
        $user->tokens()->delete();

        if ($request->hasSession()) {
            if (Schema::hasTable('sessions')) {
                DB::table('sessions')
                    ->where('user_id', $user->id)
                    ->where('id', '!=', $request->session()->getId())
                    ->delete();
            }

            // Keep the current session alive, but rotate its ID and version.
            $request->session()->regenerate(true);
            $request->session()->put('auth_session_version', $newAuthVersion);
            // Sanctum's AuthenticateSession middleware compares this value on
            // the next request. Refresh it after changing the password so the
            // current session remains valid while other sessions are revoked.
            $request->session()->put('password_hash_web', $user->getAuthPassword());
        }

        return response()->json(['success' => true, 'message' => 'Password updated successfully.']);
    }

    public function sendPasswordResetLink(Request $request): JsonResponse
    {
        $validated = $request->validate(['email' => ['required', 'email:rfc', 'max:255']]);
        $validated['email'] = Str::lower(trim($validated['email']));
        $status = Password::sendResetLink($validated);

        if (in_array($status, [Password::RESET_LINK_SENT, Password::INVALID_USER], true)) {
            // Keep the response identical whether or not the email is registered.
            return response()->json([
                'success' => true,
                'message' => 'If the account exists, a password reset link has been sent.',
            ]);
        }

        if ($status === Password::RESET_THROTTLED) {
            return response()->json([
                'success' => false,
                'message' => 'Please wait before requesting another password reset link.',
            ], 429);
        }

        return response()->json(['success' => false, 'message' => 'Unable to process the password reset request.'], 422);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'token' => ['required', 'string'],
            'email' => ['required', 'email:rfc'],
            'password' => ['required', 'confirmed', PasswordRule::min(12)->letters()->numbers()],
        ]);
        $validated['email'] = Str::lower(trim($validated['email']));

        $status = Password::reset(
            $validated,
            function (User $user, string $password): void {
                // A never-activated invitation may become active after the
                // mailbox owner completes its password setup link. A suspended
                // or previously verified inactive account must stay inactive.
                $isPendingInvitation = !$user->is_active
                    && $user->suspended_at === null
                    && $user->email_verified_at === null;

                $user->forceFill([
                    'password' => Hash::make($password),
                    'remember_token' => Str::random(60),
                    'email_verified_at' => $user->email_verified_at ?? now(),
                    'is_active' => $isPendingInvitation ? true : (bool) $user->is_active,
                    'auth_version' => ((int) $user->auth_version) + 1,
                ])->save();

                $user->tokens()->delete();
                if (Schema::hasTable('sessions')) {
                    DB::table('sessions')->where('user_id', $user->id)->delete();
                }

                event(new PasswordReset($user));
            }
        );

        if ($status === Password::PASSWORD_RESET) {
            return response()->json(['success' => true, 'message' => 'Password has been reset.']);
        }

        return response()->json(['success' => false, 'message' => __($status)], 422);
    }
}
