# Client Management — Stage 04 Report

**Stage:** 04 — Client account lifecycle and client management  
**Base:** Cumulative Stage 03 package (`my-web-auth-ui-stage-03.zip`)  
**Scope:** Laravel client lifecycle API, invitation workflow, client policy boundaries, client-management React page and related tests.  
**Out of scope:** Public-site redesign, project workflow implementation, invoice implementation, global CRM, team UI redesign and deployment.

## Summary

The existing client-management implementation was not rebuilt. Its models, migrations, routes, controllers, policies, invitation notification, client page and feature tests were inspected and extended.

The stage now covers:

- Persistent client profiles linked to a Laravel `User` account.
- Client creation and profile creation within a database transaction.
- Contracted-service assignment through the existing `client_service` relationship.
- Client list search, status/service filtering and server-side pagination.
- Client detail editing, including synchronized name/email updates on the linked user where authorized.
- Secure, expiring, single-use invitation tokens stored as SHA-256 hashes.
- Invitation resend, revocation and delivery-state reporting.
- Client activation only after password setup and email verification.
- Account suspension/revocation with session/token invalidation.
- Client self-profile access and a restricted self-update allow-list.
- Administrative activity and assigned-project viewing with explicit permission boundaries.
- Retention of client records instead of destructive deletion that could cascade through projects, invoices, messages and audit history.

## Important authorization hardening

During review, an access-boundary issue was found and corrected:

- The administrative `GET /api/clients/{client}` detail response includes administrative activity and other management metadata. Client users are now denied this endpoint even for their own profile.
- Clients use the reduced `GET /api/client/profile` endpoint, authorized through `viewOwnProfile`.
- The self-profile response no longer embeds the complete projects relation. Client projects are retrieved through the dedicated client-project API, which serializes client-visible fields.
- Client project records are included in an administrative client detail response only if the administrator also has project-view permission.
- `GET /api/clients/{client}/projects` now requires both client visibility and project-view permission.
- Changing a client's login email revokes the old invitation and sessions, disables the account until re-invitation, and is restricted to administrators with full client-management permission. The React form reflects this restriction.

## Invitation lifecycle

- Invitation lifetime is 48 hours.
- The raw token is not stored in the database; only its SHA-256 hash is stored.
- New links carry the token in the URL fragment (`#token=...`) so it is not sent in the initial HTTP request or ordinary Referer header.
- The frontend exchanges the token through a POST body.
- Successful acceptance locks and re-checks the invitation inside a transaction, sets the password through Laravel's hashed password cast, activates the client, verifies the email, marks the invitation accepted and revokes all other outstanding invitations.
- Reuse, expiry, revocation, email mismatch, account mismatch or suspended account state causes the invitation to be rejected.
- Invitation/resend operations are rate-limited.

### Email delivery state

The API distinguishes record creation from actual email transport:

- `accepted`: the configured mail transport accepted the notification call; this is not a guarantee of inbox delivery.
- `test_sink`: notification was captured by the test mail transport; no real email was delivered.
- `not_configured`: the configured mailer is `log` (or a non-test `array` mailer); the invitation exists but was not emailed.
- `failed`: sending raised an exception.
- `pending`: initial database state before delivery is recorded.

With the current local `MAIL_MAILER=log`, client creation succeeds but no email is sent. The frontend reports this accurately rather than claiming the invitation was delivered.

## Main files changed

### Laravel

- `laravel/app/Http/Controllers/Api/ClientController.php`
- `laravel/app/Http/Controllers/Api/ClientSelfController.php`
- `laravel/app/Policies/ClientPolicy.php`
- `laravel/app/Models/Client.php`
- `laravel/app/Models/ClientInvitation.php`
- `laravel/app/Http/Requests/StoreClientRequest.php`
- `laravel/app/Http/Requests/UpdateClientRequest.php`
- `laravel/app/Http/Requests/UpdateOwnClientProfileRequest.php` (reviewed; preserved as the self-update allow-list)
- `laravel/app/Http/Requests/AcceptClientInvitationRequest.php` (reviewed; preserved)
- `laravel/app/Notifications/ClientAccountInvitationNotification.php`
- `laravel/routes/clients_api.php`
- `laravel/tests/Feature/ClientLifecycleTest.php`

The existing migrations, models, services and invitation page were preserved. No new database migration was created in this stage. The existing invitation delivery-tracking migration remains part of the cumulative project; confirm its status locally before relying on the delivery fields.

### React

- `src/pages/dashboard/ClientsPage.tsx`
- `src/pages/AcceptInvitationPage.tsx` (reviewed and preserved; fragment-token POST exchange remains in place)
- `src/types/client.ts`

## Client API contract

See [`CLIENT_MANAGEMENT_API.md`](CLIENT_MANAGEMENT_API.md) for the route list, permission requirements, request fields and invitation delivery semantics.

## Verification performed in this packaging environment

| Check | Result | Notes |
|---|---|---|
| PHP syntax lint | PASS | 120 PHP files under Laravel app/bootstrap/config/database/routes/tests/public; zero syntax errors. |
| TypeScript/TSX parse | PASS (syntax only) | `ClientsPage.tsx`, `AcceptInvitationPage.tsx` and `types/client.ts` transpiled without syntax diagnostics after final Stage 04 changes. This is not a full project type-check. |
| Standalone client type check | Not run | Not required for this stage's changed types; full dependency-aware checking needs project packages. |
| PHPUnit `ClientLifecycleTest` | BLOCKED | PHPUnit could not be run because `laravel/vendor/autoload.php` and the Composer executable are unavailable in this packaging container. The 16 test methods have PHP syntax checked but are not runtime-verified here. |
| MySQL integration | NOT TESTED | No database connection from this packaging environment. |
| Browser/session/email test | NOT TESTED | Requires running local React + Laravel services and configured mail transport. |

The feature suite now contains 16 test methods covering client creation, duplicate email rejection, invitation verification/acceptance, expiry and single use, suspension, activation gating, email-change revocation, custom-admin permissions, client self-profile restrictions, client-project permission boundaries, mailer-not-configured behavior, access revocation, legacy profile linking, invitation privilege separation and reactivation from inconsistent account state. These tests are added/updated but are **not claimed as passed** until executed on the user's machine.

## Local verification after installing this package

From `D:\laravel\my-web\laravel` in PowerShell:

```powershell
composer install
php artisan config:clear
php artisan migrate:status
php artisan test --filter=ClientLifecycleTest
php artisan route:list --path=clients
```

Only if the existing delivery-tracking migration is shown as `Pending`, run:

```powershell
php artisan migrate
```

Do not run `migrate:fresh`, `db:wipe` or any destructive reset command.

From the repository root, run the frontend checks after restoring dependencies:

```powershell
npm install
npm run lint
npm test
npm run build
```

## Local mail configuration

The local `laravel/.env` currently uses `MAIL_MAILER=log`. This intentionally does not send client invitations. To send real invitations, configure a real SMTP/provider transport in `laravel/.env`, set a verified sender address, and set:

```env
FRONTEND_URL=http://localhost:3000
```

Keep credentials private. Do not copy real `.env` files into shared ZIP packages.

## Remaining limitations

- This package does not prove live MySQL integration or full PHPUnit success; run the commands above locally.
- Email delivery remains unconfigured while `MAIL_MAILER=log` is active.
- The existing `DELETE /api/clients/{client}` endpoint intentionally returns HTTP 409 to preserve business/audit history. Use suspend or revoke access instead.
- The invitation API reports transport acceptance, not final inbox delivery.
- Project visibility in the administrative Clients page now depends on `view_projects`/`manage_projects`; the full project workflow remains a separate stage.
