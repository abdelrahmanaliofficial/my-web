# Frontend Authentication & RBAC Integration — Stage 03

## Scope

Implemented the React-side integration requested in prompt 03 on top of the cumulative Stage 02 project. The Laravel Sanctum and RBAC backend from the earlier stages was preserved. No Laravel routes, migrations, models, or controllers were changed in this stage.

## Implemented changes

### 1. Authentication state and session restoration

- `src/contexts/AuthContext.tsx`
  - Continues to use Laravel Sanctum session cookies and `/api/me` as the authoritative user source.
  - Performs a Sanctum CSRF-cookie request before login.
  - Performs best-effort CSRF initialization before logout.
  - Treats missing or false `is_active` from the server as unauthenticated (fail-closed behavior).
  - Preserves 401 session-expiration handling and exposes backend/network errors rather than silently treating a failed API as a normal signed-out state.
  - Keeps password/session credentials out of browser storage.
  - Clears the legacy `admin_token` key if it exists; it does not write authentication tokens to storage.

### 2. User payload typing and sanitization

- `src/types/auth.ts`
  - Expanded the frontend permission union to match the 15 modules and five actions defined by the Laravel permission catalog (75 permission slugs).
  - Keeps `User` free of password and password-hash properties.
  - Makes the sanitized activity flag fail closed when it is absent.
  - Retains `last_login_at` for team records.

### 3. Protected routes and role-aware navigation

- `src/components/auth/ProtectedRoute.tsx` was reviewed and retained because its existing loading, unauthenticated, role, permission and 403 behavior already matched the requested client-side guard requirements.
- `src/components/auth/LoginForm.tsx` and `src/components/auth/LoginModal.tsx` were reviewed and retained: they already delegate authentication to `AuthContext`, clear the password field after submission, show backend errors, and do not persist credentials.
- `src/App.tsx`
  - Updated `/dashboard/team` to allow `super_admin` and appropriately permissioned `custom_admin` users.
  - The team route requires at least one of `view_team`, `create_team`, `update_team`, or `manage_team`; the server still validates each API operation independently.
- `src/pages/dashboard/DashboardLayout.tsx`
  - Displays the Team navigation item only when the server-issued role/permissions include a Team capability.
  - Existing section navigation remains permission-filtered.
- `src/components/auth/ProtectedRoute.tsx`
  - Reviewed and retained its loading, unauthenticated, role and permission guard behavior; no rewrite was needed.

### 4. Login routing

- `src/pages/LoginPage.tsx`
  - Keeps a requested destination only when it is an internal, permitted route.
  - Sends clients to `/client`.
  - Sends custom administrators to the first dashboard section they are permitted to view instead of always sending them to `/dashboard` (which could be forbidden for a limited administrator).
  - Falls back to the profile page when a custom administrator has no other viewable dashboard module.

### 5. Team settings and permissions UI

- `src/pages/dashboard/TeamSettingsTab.tsx`
  - Loads the permission catalog from `/api/team/permission-catalog` rather than maintaining an incomplete hardcoded list.
  - Uses the current user's permission capabilities to gate viewing, inviting, permission assignment, status changes, invitation resending, and session revocation.
  - Supports a delegated `custom_admin` with `view_team`, `create_team`, `update_team`, or `manage_team` according to the backend policy.
  - A create-only delegated admin can create an account without receiving the ability to grant permissions or read the team list.
  - Prevents a delegated admin from submitting a replacement permission set when the target has grants outside that administrator's delegation catalog.
  - Uses server-returned user records after permission and account-status updates.
  - Does not claim an invitation email was delivered unless the API reports `invitation_sent: true`.
- The Laravel API remains the authority. Hiding or disabling a button does not replace backend authorization.

### 6. Profile password change UX

- `src/pages/dashboard/ProfileTab.tsx`
  - A confirmed successful password update is not incorrectly shown as failed merely because the subsequent profile refresh fails. Refresh is treated as best effort after the password API confirms success.

### 7. Tests

- `tests/auth-rbac.test.ts`
  - Added coverage for missing `is_active` failing closed.
  - Added route and navigation checks for `view_team` and `manage_team` custom administrators.

## Files modified

- `src/contexts/AuthContext.tsx`
- `src/types/auth.ts`
- `src/App.tsx`
- `src/pages/LoginPage.tsx`
- `src/pages/dashboard/DashboardLayout.tsx`
- `src/pages/dashboard/TeamSettingsTab.tsx`
- `src/pages/dashboard/ProfileTab.tsx`
- `tests/auth-rbac.test.ts`

## Verification performed

| Check | Result | Notes |
|---|---|---|
| TypeScript syntax transpilation | PASS | 11 modified/relevant TS/TSX/test files parsed without syntax diagnostics using the installed TypeScript compiler API. |
| Standalone auth types type-check | PASS | `src/types/auth.ts` passed strict standalone TypeScript checking. |
| Targeted TypeScript check | PARTIAL | No non-dependency diagnostics were reported for the Stage 03 target files. Full project `tsc --noEmit` cannot complete because this working environment has no installed `node_modules`; imports such as React, Axios, React Router and Node types are unresolved. |
| Frontend automated tests | NOT RUN | `tsx` is not installed in this environment. `npm install` was attempted but did not complete before the execution timeout. |
| Browser login/session test | NOT RUN | Requires the user's local Laravel and Express servers and an actual Super Admin account/session. |
| Backend API authorization test | NOT RUN | The Laravel code was not modified in this stage; API behavior still needs to be exercised against the user's configured MySQL database. |

## Important local verification commands

From the repository root:

```powershell
npm install
npm run lint
npm test
```

Then run Laravel and the Express/Vite application as configured locally and verify:

1. Login with a real active account.
2. Refresh a protected route and confirm `/api/me` restores the session.
3. Log out and confirm a protected route redirects to login.
4. Expire/revoke a session and confirm the session-expired notice appears.
5. Sign in as a limited Custom Admin and verify only permitted dashboard items appear.
6. Open a forbidden route directly and confirm the 403 access-denied page appears.
7. Test Team Settings using a Super Admin, a `view_team` Custom Admin, a `create_team`-only Custom Admin, and a Custom Admin with `manage_team`.
8. Confirm denied API requests remain denied even if the user manually edits the frontend or sends requests outside React.

## Remaining limitations

- Full React type-check and test suite still need to run after dependencies are installed on the user's machine.
- Actual cookie/CSRF behavior depends on the configured local `.env`, Express proxy and Laravel Sanctum domains. It has not been browser-tested in this environment.
- Email delivery for team invitations is still controlled by the Laravel mail configuration. With `MAIL_MAILER=log`, invitation creation can succeed but the frontend now correctly avoids claiming that email was delivered.
- This stage does not add or modify backend permissions. The active permission catalog and Team API behavior remain those implemented in Stage 02.
