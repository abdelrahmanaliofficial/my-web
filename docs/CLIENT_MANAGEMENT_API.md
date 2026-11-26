# Client Management API

All administrative routes require a valid Laravel Sanctum session and an active account. Authorization is enforced by Laravel Policies and server-derived identity, not by client-supplied role or client IDs.

## Administrative endpoints

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| GET | `/api/clients` | `view_clients` or `manage_clients` | Search/filter/paginate client records. |
| POST | `/api/clients` | `create_clients` or `manage_clients`; issuing an invitation additionally requires `manage_clients` | Atomically create a linked client account/profile. A delegated creator without full client-management permission must send `send_invitation: false`. |
| GET | `/api/clients/{client}` | `view_clients` or `manage_clients` | Administrative client details, services, invitation state and activity. Projects are included only with project-view permission. |
| PUT | `/api/clients/{client}` | `update_clients` or `manage_clients` | Update permitted client profile fields and optionally contracted services. Changing the login email additionally requires `manage_clients`. |
| PUT | `/api/clients/{client}/services` | `update_clients` or `manage_clients` | Replace contracted service assignments. |
| PUT | `/api/clients/{client}/status` | `manage_clients` | Activate a verified client or suspend an account. An invited client cannot be activated before setup completion. |
| POST | `/api/clients/{client}/invite` | `manage_clients` | Issue a secure new invitation. Rate-limited to 5 requests/minute. |
| POST | `/api/clients/{client}/resend-invitation` | `manage_clients` | Revoke outstanding links and issue a new invitation. Rate-limited to 5 requests/minute. |
| POST | `/api/clients/{client}/revoke-access` | `manage_clients` | Suspend access, revoke outstanding invitations and invalidate sessions/tokens. |
| GET | `/api/clients/{client}/activity` | `view_clients` or `manage_clients` | Read administrative activity history. |
| GET | `/api/clients/{client}/projects` | Client-view permission **and** `view_projects`/`manage_projects` | Read assigned project records in the administrative client view. |
| DELETE | `/api/clients/{client}` | Delete permission is checked, then HTTP 409 | Permanent deletion is intentionally blocked to retain linked business/audit history. |

The `manage_<module>` RBAC grant continues to imply the canonical CRUD actions for that module only. It does not grant unrelated module access.

## Client self-service endpoints

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/client/profile` | Authenticated active client; own account only | Returns the reduced client profile and assigned services. It does not embed administrative activity or all project records. |
| PUT | `/api/client/profile` | Authenticated active client; own account only | Allows only `full_name`, `phone`, `company_name` and `address`. Email, role, status, client ID, service assignments and permissions are not writable here. |

Client project data is retrieved through the dedicated `/api/client/projects` routes, which derive ownership from the authenticated session and serialize client-visible project fields.

## Invitation endpoints

These endpoints are public but rate-limited to 15 requests/minute:

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/client-invitations/verify` | Accepts `{ "token": "..." }` in the request body and returns safe invitation details if the token is valid. |
| GET | `/api/client-invitations/verify?token=...` | Temporary compatibility for previously issued query-string links. New invitations use URL fragments and POST verification. |
| POST | `/api/client-invitations/accept` | Accepts the invitation token and confirmed password, then activates the client account atomically. |

Invitation tokens are generated randomly, only their SHA-256 hashes are stored, and links expire after 48 hours. On acceptance, all other outstanding invitations for the client are revoked. Tokens are not returned in normal client API responses.

## Create client request

```json
{
  "full_name": "Client Name",
  "email": "client@example.com",
  "phone": "+201000000000",
  "company_name": "Client Company",
  "address": "City, Country",
  "service_ids": [1, 2],
  "send_invitation": true
}
```

The client role, password, status, client code, user ID and permissions cannot be supplied by the browser. Laravel creates the associated user with an unknown random placeholder password; the invitee sets a password using the one-time invitation. `send_invitation: true` requires `manage_clients`; `create_clients` alone can create a pending profile/account but cannot issue an invitation.

## Update client request

Allowed administrative fields:

- `full_name`
- `email` (requires `manage_clients`, invalidates existing invitation/session and requires re-invitation)
- `phone`
- `company_name`
- `address`
- `service_ids`

Protected account and authorization fields are prohibited.

## Invitation delivery states

The response includes `invitation.delivery_status` and a human-readable `delivery_message`:

- `accepted`: configured mail transport accepted the notification call (not a delivery-to-inbox guarantee).
- `test_sink`: testing mail transport captured the message; no real email was delivered.
- `not_configured`: current mailer does not deliver email (for example `MAIL_MAILER=log`).
- `failed`: transport raised an exception.
- `pending`: initial database state before delivery is recorded.

The client profile/account remains created if email sending fails. The UI must not report that the email was sent for `not_configured` or `failed` states.
