<?php

namespace App\Providers;

use App\Models\Client;
use App\Models\Conversation;
use App\Models\Invoice;
use App\Models\MediaFile;
use App\Models\Project;
use App\Models\User;
use App\Policies\ClientPolicy;
use App\Policies\ConversationPolicy;
use App\Policies\InvoicePolicy;
use App\Policies\MediaFilePolicy;
use App\Policies\ProjectPolicy;
use App\Policies\TeamMemberPolicy;
use Illuminate\Auth\Notifications\ResetPassword;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
    }

    public function boot(): void
    {
        RateLimiter::for('auth', function (Request $request): array {
            $email = Str::lower(trim((string) $request->input('email', 'unknown')));
            $ip = (string) ($request->ip() ?: 'unknown');

            return [
                Limit::perMinute(5)->by($ip . '|email|' . $email),
                Limit::perMinute(30)->by($ip . '|all-auth'),
            ];
        });

        Gate::policy(Client::class, ClientPolicy::class);
        Gate::policy(Project::class, ProjectPolicy::class);
        Gate::policy(Invoice::class, InvoicePolicy::class);
        Gate::policy(Conversation::class, ConversationPolicy::class);
        Gate::policy(MediaFile::class, MediaFilePolicy::class);
        Gate::policy(User::class, TeamMemberPolicy::class);

        // Super Admin bypasses individual module checks only while the account is active.
        Gate::before(function (User $user): ?bool {
            if (!$user->isActive()) {
                return false;
            }

            return $user->hasRole('super_admin') ? true : null;
        });

        Gate::define('permission', function (User $user, string $permission): bool {
            return $user->hasPermissionTo($permission);
        });

        ResetPassword::createUrlUsing(function (User $user, string $token): string {
            $frontend = rtrim((string) config('app.frontend_url', config('app.url')), '/');
            return $frontend . '/reset-password?token=' . urlencode($token)
                . '&email=' . urlencode($user->email);
        });
    }
}
