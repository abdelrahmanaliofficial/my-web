# Role-based access control (RBAC)

## Canonical storage

- `roles` is the normalized role catalogue (`super_admin`, `custom_admin`, `client`).
- `users.role_id` is the authoritative role foreign key.
- `permissions` is the normalized permission catalogue.
- `permission_user` stores explicit grants for individual Custom Admins, including the administrator who granted each permission.
- The legacy `users.role` and `users.permissions` columns remain compatibility mirrors only. Authorization reads the normalized role and pivot relationships, never the legacy JSON permissions value.

## Roles

| Role | Access rule |
|---|---|
| `super_admin` | Full application access while active. The first account is initialized through the one-time Artisan command. |
| `custom_admin` | Only explicitly assigned module/action permissions. Delegated team operations are possible only when explicitly assigned. |
| `client` | No administrative permissions. Resource policies allow access only to the authenticated client's own authorized records. |

## Permission model

The canonical catalogue is `app/Authorization/PermissionCatalog.php`, seeded by migration `2026_01_07_000100_create_normalized_rbac_tables.php`. Migration `2026_01_08_000100_add_team_module_permissions.php` safely upserts the Team module slugs for databases where the original RBAC migration had already run. It currently contains 15 modules, each with `view`, `create`, `update`, `delete`, and `manage` actions (75 permission slugs total).

Modules: `stats`, `leads`, `services`, `projects`, `clients`, `billing`, `messages`, `settings`, `bookings`, `portfolio`, `testimonials`, `faqs`, `blog`, `partners`, and `team`.

Examples: `view_leads`, `create_leads`, `manage_projects`, `view_billing`, and `manage_team`.

Permission semantics:

- Individual action grants are independent. `view_projects` does not grant create, update, or delete.
- `manage_<module>` implies only that module's canonical `view`, `create`, `update`, and `delete` actions.
- A module grant never implies access to another module.
- Unknown action slugs and wildcard values such as `*` never grant access.
- Clients cannot receive explicit administrative permission grants.
- Super Admin access is derived from the normalized role, not a wildcard row.

## Team administration

Team endpoints are protected by Sanctum, active-account middleware, action-level route middleware, and `TeamMemberPolicy`. The controller repeats authorization checks before performing mutations.

| Operation | Required permission | Custom Admin limitations |
|---|---|---|
| List team members / permission catalogue / team activity | `view_team` | Lists Custom Admin accounts and filtered team activity; cannot manage self or Super Admin. |
| Invite a Custom Admin | `create_team` | May create an account with no permissions. Assigning any permissions also requires `manage_team` and every granted permission must already be held by the grantor. |
| Replace a Custom Admin's permission set | `manage_team` | Cannot edit self or Super Admin; cannot grant permissions not held by the grantor. |
| Activate/suspend a Custom Admin | `update_team` | Cannot edit self or Super Admin. State changes revoke existing sessions. |
| Resend an inactive member's invitation | `update_team` | Cannot edit self or Super Admin; account must be inactive and not suspended. |
| Revoke a Custom Admin's sessions | `update_team` | Cannot revoke self or Super Admin through team management. |

A Custom Admin cannot assign themselves additional permissions, change their role, modify a Super Admin, or delegate permissions they do not possess. A Custom Admin with only `update_team` may manage member status/session actions but cannot change permission grants.

## Enforcement layers

1. `auth:sanctum` validates the authenticated session.
2. `account.active` rejects inactive or suspended accounts and sessions with a stale `auth_version`.
3. `permission:<slug>` route middleware protects module operations.
4. Laravel Gates and Policies enforce model/resource permissions and ownership.
5. `TeamMemberPolicy` protects team listing, invitation, permission assignment, status changes and session revocation.
6. Team controller methods repeat authorization checks before performing sensitive writes.
7. Client ownership is derived from the authenticated user and never trusted from a request-supplied `client_id`.
8. Private media access is scoped to the module that owns the file.

## Initialization and audit

- The first Super Admin is created only through `php artisan app:initialize-super-admin`. The command refuses to create another initial Super Admin once one exists.
- Team invitations use a password setup/reset link; plaintext passwords are never returned or stored.
- Team permission changes, invitations, status changes and session revocations are recorded in `admin_activity_logs`.
- When the mail driver is `log`, API responses correctly report that no email was delivered.

## Important implementation notes

- `users.role_id` is authoritative; tampering with the legacy `users.role` column cannot grant Super Admin.
- `permission_user` is authoritative; changing legacy JSON cannot grant permissions.
- Changing a Custom Admin to another role detaches all explicit permission grants.
- Disabling a team account increments `auth_version`, rotates `remember_token`, revokes personal access tokens and deletes database sessions where available.
- No Team UI changes are part of this backend authorization stage.
