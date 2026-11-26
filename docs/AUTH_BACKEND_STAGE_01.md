# Authentication Backend — Stage 01

## Scope

This delivery implements the first authentication-backend prompt only. It does not redesign React pages or implement unrelated CMS, CRM, billing, or project features.

## Implemented

- Laravel Sanctum remains configured for first-party, cookie/session authentication.
- Login now requires a stateful first-party browser request and rotates the session ID.
- Login normalizes the submitted email and checks the stored password hash.
- Suspended/inactive users are rejected before a session is created.
- The `/api/me` response continues to use the safe user serializer; it does not return a password or remember token.
- Logout clears the server-side guard, invalidates the session, and regenerates the CSRF token.
- Password change checks the current password, enforces a minimum 12-character letters-and-numbers rule, rotates the current session ID, updates Sanctum’s stored password-hash marker for the current session, and revokes other sessions/tokens.
- Password reset uses Laravel's password broker, returns a non-enumerating response for unknown addresses, increments the authentication version, removes existing sessions/tokens where applicable, and does not reactivate a suspended account.
- A pending, never-activated invitation account may become active after its email owner completes the secure password setup/reset link.
- Email verification notification and signed verification callback routes were added. Enforcement is configurable through `AUTH_REQUIRE_VERIFIED_EMAIL` and defaults to `false` until mail delivery is configured.
- A named authentication rate limiter applies five attempts per minute per IP/email pair and a 30-attempt per-minute IP-wide ceiling.
- Protected API route groups now apply account/session validation after `auth:sanctum`.
- `auth_version` provides session revocation even when the local session driver is `file`; a stale or missing production session marker is rejected.
- Team suspension/session revocation and client suspension/reactivation/access revocation bump the same authentication version.
- Trusted forwarded headers are limited to configured proxy addresses instead of trusting every source.

## Files changed or added

- `laravel/app/Http/Controllers/Api/AuthController.php`
- `laravel/app/Http/Controllers/Api/EmailVerificationController.php` (new)
- `laravel/app/Http/Middleware/EnsureActiveAccountSession.php` (new)
- `laravel/app/Models/User.php`
- `laravel/app/Providers/AppServiceProvider.php`
- `laravel/app/Http/Controllers/Api/TeamController.php`
- `laravel/app/Http/Controllers/Api/ClientController.php`
- `laravel/app/Http/Controllers/Api/ClientSelfController.php`
- `laravel/bootstrap/app.php`
- `laravel/config/auth.php`
- `laravel/routes/api.php`
- `laravel/routes/clients_api.php`
- `laravel/routes/projects_api.php`
- `laravel/routes/billing_api.php`
- `laravel/routes/media_api.php`
- `laravel/routes/messages_api.php`
- `laravel/database/migrations/2026_01_06_000100_add_auth_version_to_users_table.php` (new)
- `laravel/tests/Feature/AuthenticationSessionTest.php` (new)
- `laravel/.env.example`

## Required local environment values

The Laravel `.env` file is local and is intentionally not included in this ZIP. For the local setup described in this project:

```env
APP_URL=http://127.0.0.1:8100
FRONTEND_URL=http://localhost:3000
DB_DATABASE=my_web
SESSION_HTTP_ONLY=true
SESSION_SECURE_COOKIE=false
SESSION_SAME_SITE=lax
SANCTUM_STATEFUL_DOMAINS=localhost:3000,127.0.0.1:3000,localhost,127.0.0.1
FRONTEND_ORIGIN=http://localhost:3000
TRUSTED_PROXIES=127.0.0.1,::1
AUTH_REQUIRE_VERIFIED_EMAIL=false
```

`APP_URL` is the Laravel/API origin used to create signed Laravel verification URLs. `FRONTEND_URL` is the React website origin used for browser-facing redirects and password reset links. Do not interchange these two values.

For production, use HTTPS, set `SESSION_SECURE_COOKIE=true`, set `APP_DEBUG=false`, configure the real frontend/API origin, and configure `TRUSTED_PROXIES` with the actual reverse-proxy addresses. Do not expose `.env` values.

`MAIL_MAILER=log` is suitable only for local testing; it logs mail instead of delivering it. Configure a real mail provider before relying on email verification or password reset emails.

## Database migration required

A new non-destructive migration adds `auth_version` to `users`:

`2026_01_06_000100_add_auth_version_to_users_table.php`

After replacing the files, run from the `laravel` directory:

```powershell
php artisan config:clear
php artisan migrate:status
php artisan migrate
```

The new migration should appear as pending before the final command and as Ran afterward. Do not run `migrate:fresh`, `db:wipe`, or destructive reset commands.

## Tests added

`AuthenticationSessionTest` covers:

- Valid login and safe `/api/me` serialization.
- Invalid credentials.
- Suspended-account login rejection.
- Unauthenticated `/api/me` access.
- Logout/session invalidation.
- Stale authentication-version rejection.
- Suspended-account request rejection.
- CSRF-cookie route availability for the first-party frontend.
- Rejection of login requests that do not establish a first-party stateful session.
- Login throttling.
- Password-change session rotation.
- Generic password-reset request behavior and notification dispatch.
- Password-reset activation rules and session-version increment.
- Email verification notification and signed callback.
- Optional verified-email enforcement.
- Remember-me restoration and invalidation after the authentication version/remember token is rotated.

## Verification performed in this delivery environment

- `php -l` passed for all 110 PHP files in the Laravel tree with zero syntax errors after the final edits.
- Full PHPUnit execution was not possible in this packaging environment because Composer and `laravel/vendor` are not present here.
- No MySQL connection or HTTP/browser session test was run here.
- No migration was executed against the user's local database from this environment.

Therefore this stage is code-complete within its stated scope, but runtime verification remains pending on the user's machine. Do not treat it as production-certified until the tests below pass locally.

## Local verification commands

From `D:\laravel\my-web\laravel`:

```powershell
php artisan config:clear
php artisan migrate:status
php artisan migrate
php artisan route:list --path=api
php artisan test --filter=AuthenticationSessionTest
php artisan test
```

Then test in the browser through the Express frontend origin (`http://localhost:3000`):

1. Open the site and sign in using an existing valid account.
2. Confirm `/api/me` returns the safe user profile.
3. Sign out and confirm `/api/me` returns 401.
4. Test a suspended account and confirm it cannot sign in or continue using an existing session.
5. Test password reset with `MAIL_MAILER=log` and inspect Laravel logs for the generated message in local development.
6. Confirm the first-party CSRF cookie and session cookie are set; the session cookie must be HttpOnly.

## Known caveat

The login, password reset, and verification flows are implemented in the backend. The frontend was intentionally not modified in this backend-only stage. Any additional user-facing verification message or UI state can be handled in the later frontend integration prompt.

The current test environment runs with `APP_ENV=testing`, where Laravel's CSRF middleware intentionally skips token enforcement. The added tests verify the Sanctum CSRF-cookie endpoint and reject login requests that do not arrive from a configured stateful frontend origin. A negative browser test with a deliberately invalid `X-XSRF-TOKEN` must still be performed through the running local Express proxy. Session timeout is configured through Laravel's session lifetime; the automated tests also verify the configured lifetime and reject stale/revoked session versions. The new PHPUnit tests have not been executed in this packaging environment, so their runtime result remains unverified until run on the owner's machine.


## Final review notes

- Added the missing `Illuminate\Http\Request` import to `EmailVerificationController`; without it, Laravel would fail to resolve the `send` action parameter at runtime even though PHP syntax lint alone would pass.
- After a password change, the current session now refreshes Sanctum's `password_hash_web` marker as well as `auth_session_version`. This prevents Sanctum's `AuthenticateSession` middleware from treating the current session as stale on the next request while other sessions are revoked.
- Every protected route group in the split API route files now applies both `auth:sanctum` and `account.active`.
- The project uses the existing same-origin Express proxy (`/api` and `/sanctum`) for the preferred local browser flow. Use `http://localhost:3000` consistently in the browser; do not mix `localhost` and `127.0.0.1` in the browser origin.
