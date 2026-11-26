# RBAC and Team Authorization — Stage 02 Report

## Scope

This stage implements the backend role-based access-control and team-management requirements. React authentication and dashboard components were not modified, in accordance with the prompt.

## Implemented

### Roles and permissions

- Normalized role records: `super_admin`, `custom_admin`, `client`.
- `users.role_id` is the authoritative role reference. Legacy `users.role` remains a compatibility mirror only.
- Normalized permission catalogue and `permission_user` grants with a `granted_by` foreign key.
- 15 modules × 5 actions = 75 permission slugs. Modules: `stats`, `leads`, `services`, `projects`, `clients`, `billing`, `messages`, `settings`, `bookings`, `portfolio`, `testimonials`, `faqs`, `blog`, `partners`, and `team`.
- `manage_<module>` implies that module's `view`, `create`, `update`, and `delete` permissions only. It does not imply unknown actions, another module, or `*`.
- Super Admin access is role-derived and active-account-gated; no wildcard row is assigned. Clients cannot receive administrative grants.

### Enforcement

- `EnsureRole` and `EnsurePermission` middleware remain registered in `bootstrap/app.php`.
- `AppServiceProvider` registers resource policies and `TeamMemberPolicy` for `User`, defines the normalized permission Gate, and retains the active Super Admin Gate bypass.
- Client, Project, Invoice, Conversation and MediaFile policies use normalized permissions and owner checks.
- TeamController now authorizes listing, permission-catalog access, activity access, invitations, permission changes, status changes, resend invitations and session revocation through `TeamMemberPolicy`, in addition to route middleware.
- Team mutation methods explicitly restrict targets to `custom_admin` before authorization, so even the global Super Admin Gate bypass cannot mutate a Super Admin account through team routes.

### Team delegation rules

- `view_team`: list Custom Admin accounts, read the permission catalogue and permitted team activity.
- `create_team`: invite a Custom Admin with no permissions.
- Assigning permissions during invitation additionally requires `manage_team`, and the grantor may assign only permissions they effectively possess.
- `manage_team`: replace another Custom Admin's permission set, but never edit the grantor's own permissions and never grant permissions the grantor does not hold.
- `update_team`: activate/suspend another Custom Admin, resend an eligible invitation and revoke sessions. It does not grant permission-assignment rights.
- Custom Admins cannot create a Super Admin, modify any Super Admin, alter their own team account through team endpoints, or grant themselves higher privileges.
- All team mutations write activity records. Account-state changes and session revocation bump `auth_version`, rotate the remember token, revoke personal access tokens and delete database sessions when that table is present.
- In local development with `MAIL_MAILER=log`, invitation APIs report `invitation_sent: false` rather than falsely claiming an email was delivered.

## Files changed or added in this stage

- `laravel/app/Authorization/PermissionCatalog.php` — clarified delegated team permissions and canonical module/action matrix.
- `laravel/app/Policies/TeamMemberPolicy.php` — new policy for team listing, invitation, permission delegation, status changes and session revocation.
- `laravel/app/Providers/AppServiceProvider.php` — registered `TeamMemberPolicy` for `User`.
- `laravel/app/Http/Controllers/Api/TeamController.php` — replaced scattered route-only authorization checks with policy calls and explicit target restrictions; retained transactional updates and activity logging.
- `laravel/routes/api.php` — existing team routes remain protected by the matching `view_team`, `create_team`, `update_team` and `manage_team` middleware.
- `laravel/app/Models/User.php` — uses normalized role/permission records, validates grants and blocks delegated escalation; this file was preserved and verified as part of this stage.
- `laravel/database/migrations/2026_01_07_000100_create_normalized_rbac_tables.php` — seeds the normalized roles and 75 permission slugs.
- `laravel/database/migrations/2026_01_08_000100_add_team_module_permissions.php` — safely upserts the five Team-module slugs even if the earlier RBAC migration had already run on the local database. Its rollback is intentionally non-destructive so assigned grants are not cascade-deleted.
- `laravel/tests/Feature/RolePermissionTest.php` — expanded coverage for all modules, delegated team rules, privilege escalation, self/Super Admin protection, inactive accounts and permission semantics.
- `docs/RBAC_PERMISSION_MATRIX.md` — corrected and expanded implementation matrix.
- `docs/PROJECT_AUDIT_AND_CHANGELOG.md` — appended this stage's implementation record.

## Verification performed in the packaging environment

| Check | Result | Details |
|---|---|---|
| PHP syntax | PASS | `php -l` passed for 119 PHP files, including the new policy and updated tests. |
| Permission catalogue vs migration | PASS | Static comparison found exactly 75 permission slugs in both sources, with no missing or extra entries. |
| Composer / Laravel bootstrap | NOT RUN | Composer executable and `laravel/vendor` dependencies are not available in this packaging environment. |
| PHPUnit Feature tests | NOT RUN | Requires Composer dependencies and the configured test database; no test run is claimed. |
| MySQL integration | NOT RUN | Must be verified against the user's local `my_web` database. |
| Frontend build | NOT RUN | No React files were changed in this stage. |

## Local verification on Windows

From the repository root, open PowerShell and run:

```powershell
cd laravel
php artisan config:clear
php artisan migrate:status
php artisan migrate
php artisan route:list --path=api/team
php artisan test --filter=RolePermissionTest
php artisan test --filter=AuthorizationBoundaryTest
```

`php artisan migrate` is non-destructive for already-applied migrations; it runs only pending migrations. Do not use `migrate:fresh` or database reset commands. If the permission migration is already marked as `Ran`, the command should leave it unchanged.

## Known limits

- This stage adds backend RBAC and team authorization; it does not implement the React Team Settings UI.
- Actual route boot, Gate/Policy runtime behavior, invitation delivery, PHPUnit and MySQL execution remain unverified until Composer dependencies and the user's local services are available.
- Email delivery depends on valid mail configuration. A log mailer is not real delivery.
