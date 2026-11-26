# Project Audit and Change Log

**Reviewed source archive:** `my-web.zip` (the latest archive designated by the project owner)  
**Review date:** 2026-11-25  
**Project:** Abdelrahman Ali — Personal Website and Client Portal

## 1. Executive summary

The repository is not a blank project. It already contained a substantial React frontend and custom Laravel business code for client accounts, projects, milestones, tasks, updates, private media, invoices, conversations and messages.

The main structural blocker was that the custom Laravel code existed without a complete Laravel application scaffold. The frontend already expected Laravel Sanctum endpoints, but the backend framework entry points, framework configuration, user model, user migration and central API route registration were missing from the supplied archive.

This package restores that framework foundation and fixes a number of confirmed integration and security issues. It does **not** mean every feature in the previously supplied implementation prompts is now complete. In particular, the full CMS, bookings, CRM leads, newsletter, general email/notification workflows and visual redesign remain incomplete or unverified.

## 2. Prompt-by-prompt implementation comparison

Status definitions:
- **Implemented in source:** corresponding code exists in the repository. Runtime verification may still be pending.
- **Partial:** some related code exists, but the requested end-to-end functionality is incomplete.
- **Not implemented:** no sufficient backend/frontend implementation was found in this archive.
- **Not runtime-verified:** source exists, but the required dependencies, live MySQL database, mail provider or running app were unavailable in this review environment.

| Prompt scope | Source evidence in this archive | Status |
|---|---|---|
| Laravel application foundation | A Laravel 12 Composer manifest, `artisan`, bootstrap, config, public entry point, routes and providers have been added in this package. | Implemented in source; runtime not verified |
| Sanctum authentication | Existing React `AuthContext`, `apiClient`, CSRF/session flow, plus Laravel login/logout/me/password-reset controllers and routes. | Partial; runtime not verified |
| Roles and permissions | `User` roles, permission checks, policies and team API exist. The current permission storage is a JSON array on `users`, not a normalized role-permission pivot model. | Partial |
| Super Admin initialization | One-time interactive `app:initialize-super-admin` Artisan command; it does not create a default public account. | Implemented in source; runtime not verified |
| Team administration | Team invite, permission assignment, activation/suspension, invitation resend and session revocation are implemented. Team APIs are restricted to Super Admin. | Implemented in source; mail delivery not verified |
| Client account lifecycle | Existing `ClientController`, `ClientSelfController`, invitation model/notification, client policies and feature tests. | Implemented in source; runtime not verified |
| Project tracking | Existing project controllers/models, milestones, tasks, updates, approval flow, policies and feature tests. | Implemented in source; runtime not verified |
| Persistent media and private files | Existing `MediaFileController`, `PersistentStorageService`, `MediaFile` model/policy, signed download support and tests. | Implemented in source; storage disk configuration not runtime-verified |
| Project file UI | Existing client project file component and project file contexts/pages are present. | Partial; browser integration not runtime-verified |
| Invoices and payments | Existing invoice controller/models, line items, payment records, PDF service, client invoice routes and tests. | Implemented in source; PDF/runtime not verified |
| Client/admin messaging | Existing conversation and message controllers/models, attachment model/routes, policies and tests. | Implemented in source; runtime not verified |
| Core site settings | Added persistent `settings` table model/controller and `/api/settings` plus `/api/hero-media`; `SettingsContext` now reads/writes the API rather than storing business settings in `localStorage`. | Partial; database not runtime-verified |
| Full bilingual CMS | No complete persistent CRUD implementation was found for portfolio, testimonials, FAQ, blog, partners and all homepage/about sections. | Not implemented |
| Services and pricing CMS | Existing service model/table and public service read route exist; full administrator CRUD/pricing module was not found. | Partial |
| Contact forms and leads CRM | Frontend still calls `/api/bookings` and `/api/contact-messages`; no complete Laravel lead/contact routes, controllers and migrations were found. | Not implemented |
| Booking management | Frontend calls `/api/bookings`, but the matching Laravel booking controller/routes/schema are absent. | Not implemented |
| Newsletter | Frontend calls `/api/subscribe`; no persistent subscriber backend was found. | Not implemented |
| General email and notifications | Password reset/team invitation flow exists. Example mailer is `log`; general persisted notification center and provider delivery are not configured. | Partial |
| Gmail integration | A dedicated `src/lib/gmail.ts` file was not present in the supplied archive. | Not implemented in this archive |
| AI reply suggestions | Express `/api/suggest-reply` exists, verifies an authenticated admin through Laravel `/api/me`, and calls Gemini when `GEMINI_API_KEY` is configured. Provider and rate-limit behavior were not runtime-tested. | Partial |
| Social publishing | No verified official publishing integration was found. | Not implemented |
| Analytics | A live analytics backend was not found. The misleading hardcoded demo KPIs/chart have been removed from the dashboard and replaced with an unconfigured/empty state. | Partial; no analytics provider/backend |
| Public website visual redesign | Existing visual components remain; this package does not complete the requested sky-blue/white/black redesign or provide an authentic portrait. | Not implemented |
| Admin/client dashboard redesign | Existing dashboard components and flows are preserved; no full visual redesign is included. | Not implemented |
| Security/functional QA | Additional checks and tests were added, but full end-to-end tests could not run without installed dependencies and a configured test database. | Partial; runtime not verified |
| Production deployment and backup | Environment examples and safer startup behavior are included. No real production environment, backup target or restoration was available to test. | Not runtime-verified |

## 3. Important findings and changes made in this package

### Laravel framework and backend foundation

Added a Laravel 12 application scaffold under `laravel/` while preserving the existing custom controllers, models, policies, services, migrations and feature tests:

- `laravel/composer.json`
- `laravel/artisan`
- `laravel/bootstrap/app.php`
- `laravel/bootstrap/providers.php`
- Laravel configuration files, including database, auth, Sanctum, CORS, sessions, filesystems, mail and queue
- `laravel/public/index.php`
- `laravel/routes/api.php` and supporting route registration
- `laravel/app/Models/User.php`
- `laravel/app/Models/SiteSetting.php`
- authentication, team and settings API controllers
- initial users, sessions, password-reset, Sanctum-token, settings and admin-activity migrations
- `laravel/database/factories/UserFactory.php`
- Laravel test bootstrap and PHPUnit configuration

The database name in `laravel/.env.example` is `my_web`, matching the MySQL database name the owner confirmed.

### Authentication and authorization

- Added Laravel session-based login/logout/current-user/password-reset endpoints.
- Configured Sanctum stateful API and CSRF middleware.
- Added a one-time interactive Super Admin initialization command.
- Added team invitation, permission, account status and session revocation endpoints.
- Initially restricted team list/activity and team mutation endpoints to Super Admin; this boundary was subsequently expanded in Stage 02 to allow only explicitly delegated `team` permissions with guardrails.
- Restricted team mutation targets to `custom_admin` accounts, preventing those endpoints from modifying client accounts.
- Removed wildcard (`*`) permission bypasses for custom administrators in frontend checks, Laravel policies and Express AI-reply authorization. Super Admin access is derived from the Super Admin role. Added a Laravel authorization-boundary test and a frontend regression assertion for legacy wildcard permissions.
- Added a Laravel feature test for team authorization boundaries and a frontend test for wildcard permission rejection.

### Frontend and integration fixes

- Reworked `SettingsContext` to persist site settings and hero-media references through Laravel APIs. Only the dark-mode preference remains in local storage as a non-business preference.
- Updated settings UI to display real API errors and only show successful-save feedback after a successful backend response.
- Removed fabricated dashboard analytics values and chart. The dashboard now shows an empty/unconfigured state rather than invented business numbers.
- Removed the dashboard's stale booking-statistics request that relied on a missing bookings endpoint.
- Added forgot-password and reset-password pages and routes, matching the Laravel password broker flow.
- At the earlier baseline stage, the team UI reflected the then-current Super Admin-only API boundary. The later Stage 02 backend now supports explicitly delegated team permissions; the React team UI is intentionally unchanged in that backend-only stage.
- Updated the root test script to point to the seven frontend test files that actually exist in this archive.
- Made Laravel startup opt-in (`AUTO_START_LARAVEL=false` by default). The Express server no longer runs key generation, migrations or storage-link commands automatically during startup.
- Updated sitemap generation to use the configured `APP_URL`, avoid a guessed domain, and exclude protected dashboard routes.
- Updated README with Windows/PowerShell setup guidance.

## 4. Confirmed remaining blockers

1. **The Laravel dependencies are not installed in this archive.** `laravel/vendor/autoload.php` is absent. `composer install` must be run on the owner's machine.
2. **A Composer executable was not available in the review container.** Composer validation and Artisan runtime checks could not be completed here.
3. **No PDO MySQL or SQLite driver was available in the review container.** MySQL connectivity and Laravel migrations/tests could not be executed here.
4. **Frontend dependencies are not installed.** There is no `node_modules` directory and no npm lockfile in the supplied archive. The project TypeScript check and frontend tests therefore could not run successfully in this environment.
5. **Bookings, leads, contact-message persistence and newsletter APIs are missing.** Existing public forms still call endpoints that need to be implemented before they can be considered operational.
6. **The complete CMS is not finished.** Site settings and hero-media persistence were added, but the portfolio, testimonials, FAQ, blog, partners and complete homepage content management workflows still need implementation.
7. **Service management is incomplete.** A public service read endpoint exists, but full administrator service/pricing CRUD was not found.
8. **Email delivery is not production-configured.** `MAIL_MAILER=log` is only suitable for local testing; it writes reset/invitation messages to logs rather than delivering them to a mailbox.
9. **Gmail integration is not present as the referenced `src/lib/gmail.ts` module.** Optional Gmail workflows must be implemented and configured separately.
10. **Visual redesign is not complete.** The requested personal-brand redesign and genuine profile/portfolio assets remain outstanding.

## 5. Verification performed in the review container

| Check | Result | Notes |
|---|---|---|
| PHP syntax check | **PASS** | `php -l` completed on 106 PHP files with zero syntax errors. |
| Sitemap generator syntax | **PASS** | `node --check scripts/generate-sitemap.js` completed successfully. |
| Frontend TypeScript check | **BLOCKED** | `npm run lint` failed because project dependencies/types such as React, Express, Vite and Node types are not installed (`node_modules` absent). This is not evidence that the source compiles. |
| Frontend tests | **NOT RUN** | `npm test` could not start because `tsx` is not installed. |
| Production build | **BLOCKED** | `npm run build` stops in sitemap generation because the `dotenv` package is not installed; frontend dependencies are absent. |
| Laravel Artisan | **NOT RUN** | `php artisan --version` cannot bootstrap without `laravel/vendor/autoload.php`. |
| Composer validation/install | **NOT RUN** | Composer executable is unavailable in the review container. |
| MySQL connection/migrations | **NOT RUN** | The review container has PDO but no `pdo_mysql` extension and no connection to the owner's local MySQL service. |
| Laravel feature tests | **NOT RUN** | Composer dependencies and the SQLite PDO driver are unavailable in the review container. |
| Browser/end-to-end/security tests | **NOT RUN** | No running local application or configured test database was available in this environment. |

## 6. Safe local setup on Windows

1. Keep a backup of the current project folder.
2. From the repository root, create the frontend/Express environment file:

   `Copy-Item .env.example .env`

3. Create the Laravel environment file:

   `Copy-Item laravel/.env.example laravel/.env`

4. Set the MySQL credentials in `laravel/.env`. Keep `DB_DATABASE=my_web` if that is the exact database name in MySQL.
5. Install the frontend dependencies from the repository root:

   `npm install`

6. Install Laravel dependencies:

   `cd laravel`

   `composer install`

7. Generate the Laravel application key:

   `php artisan key:generate`

8. Verify the selected database before making schema changes:

   `php artisan migrate:status`

9. Only if this is the intended empty development database and the migration list has been reviewed, run:

   `php artisan migrate`

10. Initialize the first Super Admin interactively:

    `php artisan app:initialize-super-admin`

11. Create the public storage link if required by the configured public disk:

    `php artisan storage:link`

12. Start Laravel separately on port 8100:

    `php artisan serve --host=127.0.0.1 --port=8100`

13. In a second terminal at the repository root, run:

    `npm run dev`

The Express frontend normally listens on port 3000 and proxies `/api`, `/sanctum` and `/storage` to Laravel at `http://127.0.0.1:8100`.

Do not run `migrate:fresh` on a database that may contain data. Do not copy the example environment files over a real `.env` after configuration.

## 7. Acceptance rule

A module is ready for production only after its frontend operation, Laravel endpoint, authorization policy, database read/write behavior and persistence across a new browser session have all been tested. Source files existing in the repository, or a successful PHP syntax check, do not by themselves establish production readiness.


## 8. Project-wide working rules accepted

The owner supplied a project-wide engineering instruction prompt. It has been recorded in `docs/PROJECT_WORKING_RULES.md` and is to govern all subsequent implementation tasks. This instruction-only step intentionally made no application runtime or business-logic changes.

## Authentication Backend — Stage 01 (2026-11-26)

Implemented the first dedicated authentication prompt in the Laravel backend. Added session-version revocation, active-account middleware across protected API groups, login throttling, session-based login/logout/password-change/password-reset hardening, and signed email verification endpoints. Added a non-destructive migration for `users.auth_version` and an authentication feature test suite. Full runtime PHPUnit/MySQL/browser verification remains pending because Composer dependencies and the user's local database are not available in this packaging environment. See `docs/AUTH_BACKEND_STAGE_01.md` for exact changes and local verification steps.


### Authentication Backend — follow-up review (2026-11-26)

- Fixed the missing `Illuminate\Http\Request` import in `EmailVerificationController`, which was a runtime dependency-injection defect not detected by PHP syntax lint.
- Updated the current session's `password_hash_web` marker after password changes to remain compatible with Sanctum's `AuthenticateSession` middleware.
- Re-ran PHP syntax lint across 110 Laravel PHP files: zero syntax errors.
- PHPUnit, Composer validation, Artisan route checks, MySQL and browser/CSRF tests remain unexecuted in this packaging container; the local test commands are documented in `AUTH_BACKEND_STAGE_01.md`.


## Stage 02 — Normalized RBAC and delegated team authorization

- Added normalized `roles`, `permissions`, and `permission_user` tables, plus `users.role_id`. Existing `role` and `permissions` columns remain compatibility mirrors and are not authoritative for access decisions.
- Added Role and Permission models and a canonical permission catalogue containing 75 slugs: 15 modules (`stats`, `leads`, `services`, `projects`, `clients`, `billing`, `messages`, `settings`, `bookings`, `portfolio`, `testimonials`, `faqs`, `blog`, `partners`, `team`) multiplied by five actions (`view`, `create`, `update`, `delete`, `manage`).
- Added/retained action-level permission middleware, the permission Gate, and normalized `User::hasPermissionTo()` semantics. `manage_<module>` implies only that module's canonical CRUD actions. Unknown actions and `*` do not grant Custom Admin access.
- Added a separate non-destructive migration to upsert the five Team-module permission slugs even when the original RBAC migration was already applied on an existing local database.
- Added `TeamMemberPolicy` and registered it for `User`. Team routes now combine Sanctum/active-account middleware, action-level route middleware, policy checks, controller-side checks and permission-delegation validation.
- Team management can be delegated through explicit `team` permissions. A delegated Custom Admin may grant only permissions they already hold, cannot change their own team account, cannot assign the `super_admin` role, and cannot mutate any Super Admin account. `update_team` alone permits status/session operations but not permission grants.
- Team invitation, permission replacement, activation/suspension and session revocation are recorded in `admin_activity_logs`. Suspension/revocation bumps `auth_version`, rotates the remember token and removes database sessions/personal access tokens where available.
- Updated `RolePermissionTest` to cover all 15 modules, team action implications, delegated grants, privilege-escalation denial, self/Super Admin protection, inactive accounts and Super Admin management.
- Updated `docs/RBAC_PERMISSION_MATRIX.md` to reflect the implemented policy and routes.
- No React files were changed in this backend-only task.
- See `docs/RBAC_STAGE_02_REPORT.md` for scope, verification and local test commands.

## Stage 03 — React Sanctum/RBAC integration

**Status:** Implemented in the cumulative Stage 03 package; browser/API execution remains pending on the user's local environment.

### Changes
- Reviewed `LoginForm.tsx`, `LoginModal.tsx` and `ProtectedRoute.tsx`; their existing AuthContext integration and route guard behavior were retained without unnecessary rewrites.
- Updated `AuthContext.tsx` to fail closed when the server omits active-account state, preserve clear 401/403/network handling, initialize CSRF before login, and perform best-effort CSRF initialization before logout.
- Expanded the frontend permission type catalog to the same 15 modules × 5 actions used by Laravel (75 slugs).
- Updated the Team route and dashboard navigation to honor server-issued Team permissions for Custom Admins.
- Reworked Team Settings to retrieve the permission catalog from Laravel, gate each team action by the corresponding capability, avoid over-granting delegated permissions, and accurately distinguish account creation from actual invitation-email delivery.
- Updated login redirection so limited Custom Admins land on a section they can access.
- Ensured a profile refresh failure after a successful password-change response does not falsely report the password update as failed.
- Added RBAC tests for fail-closed active status and Team navigation/route access.

### Modified files
- `src/contexts/AuthContext.tsx`
- `src/types/auth.ts`
- `src/App.tsx`
- `src/pages/LoginPage.tsx`
- `src/pages/dashboard/DashboardLayout.tsx`
- `src/pages/dashboard/TeamSettingsTab.tsx`
- `src/pages/dashboard/ProfileTab.tsx`
- `tests/auth-rbac.test.ts`

### Verification
- 11 relevant TypeScript/TSX/test files passed syntax transpilation.
- `src/types/auth.ts` passed standalone strict TypeScript checking.
- Full `tsc`, `npm test`, and browser session verification were not completed because dependencies are not installed in the packaging environment and `npm install` did not finish before timeout.
- No claim of end-to-end Sanctum/browser success is made by this stage report.

## Stage 04 — Client account lifecycle and client management

- Continued from the cumulative Stage 03 package; retained the Sanctum/RBAC foundation and existing Laravel client/project/invoice/message code.
- Reviewed and extended `ClientController`, `ClientSelfController`, `ClientPolicy`, client request validators, invitation model/notification, client API routes, `ClientsPage`, `AcceptInvitationPage`, and client TypeScript types.
- Preserved transactional creation of a linked `User` and `Client` profile; contracted services continue to use the existing `client_service` pivot relationship.
- Added accurate invitation mail transport states (`accepted`, `test_sink`, `not_configured`, `failed`, `pending`) so the app does not claim an invitation email was delivered when `MAIL_MAILER=log` is configured.
- Hardened invitation expiry and single-use acceptance. Raw tokens are not persisted; accepted invites revoke other outstanding tokens. New email links keep tokens in a URL fragment and submit them to the verify endpoint via POST.
- Added/retained client lifecycle safeguards: no manual activation before password setup/email verification, email change invalidates existing invites and access until re-invitation, suspend/revoke invalidates sessions/tokens, and resend is disallowed for an already activated account.
- Restricted client self-profile changes to name, phone, company and address. Client profile/detail APIs are separated: clients cannot use administrative detail/activity/project endpoints, and the reduced self-profile response no longer embeds all project records.
- Administrative project data is included in client detail responses only when the actor also has `view_projects`; the explicit client-project list endpoint requires both client visibility and project-view permission. The Clients page hides the Projects tab when the permission is absent.
- Login-email changes now require full `manage_clients` permission because the operation disables the account, invalidates sessions/invitations and requires a new setup invitation. The frontend email field reflects this rule.
- Added server-side pagination controls to the client directory and retained search/status/service filtering.
- Added rate limits to initial/resend invitation endpoints.
- Permanent client deletion remains blocked with HTTP 409 to prevent cascading loss of project, invoice, message, file and audit history; administrators should suspend or revoke access instead.
- Added/expanded `ClientLifecycleTest` coverage for creation, duplicates, invitation acceptance/expiry/single use, account suspension, email-change invalidation, custom-admin permissions, project-view boundaries, mailer-not-configured behavior, revocation and legacy profile linking.
- Added `docs/CLIENT_MANAGEMENT_STAGE_04_REPORT.md` and `docs/CLIENT_MANAGEMENT_API.md`.
- Verification in this packaging container: 120 PHP files passed `php -l`; the three changed/relevant TS/TSX files passed syntax transpilation. PHPUnit was attempted but blocked because this packaging container has no `laravel/vendor/autoload.php` and no Composer executable. MySQL, browser/session and real email delivery were not tested here.

- Follow-up hardening in Stage 04: a delegated `create_clients` grant can no longer issue an invitation through the create endpoint unless the actor also has `manage_clients`; the UI hides the invitation option for profile-only creators. Client reactivation now determines whether sessions need revocation from the prior state before updating either the Client or User record. Added regression tests for both cases.

---

## Stage 05 — Project tracking and task management hardening

Implemented on the cumulative Stage 04 project.

### Changes
- Added shared validation rules for active/invited client assignment and active administrative team-member assignment.
- Tightened project and task assignment validation.
- Added a project assignment-options endpoint with project permission checks and minimal client/staff fields.
- Updated the admin Projects page to use that dedicated endpoint rather than requiring broad clients/team listing permissions.
- Split administrator project-detail serialization from client portal serialization to prevent exposure of private internal notes and hidden tasks.
- Restricted the administrative approval response endpoint to project administrators; clients use the dedicated client approval endpoint.
- Made approval requests single-use with transaction locking and HTTP 409 for repeat responses.
- Hardened milestone ordering to require every milestone belonging to the project exactly once.
- Serialized milestone sort-order allocation under a project lock.
- Kept completed projects at 100% progress.
- Added effective start/completion date validation on partial project updates.
- Prevented project deletion while files or invoices remain attached.

### Added files
- `laravel/app/Support/ProjectAssignmentRules.php`
- `laravel/tests/Feature/ProjectManagementHardeningTest.php`
- `docs/PROJECT_TRACKING_STAGE_05_REPORT.md`

### Updated files
- Project request validation, policy, routes and controllers.
- `laravel/tests/Feature/ProjectTrackingTest.php`
- `src/pages/dashboard/ProjectsPage.tsx`

### Verification
- PHP syntax lint: PASS, 122 PHP files.
- Node sitemap syntax check: PASS.
- PHPUnit, MySQL integration, frontend lint/build and browser tests: NOT RUN in the packaging environment because Composer/vendor, DB PDO driver/connection, and node_modules are unavailable.

See `docs/PROJECT_TRACKING_STAGE_05_REPORT.md` for details and local test commands.


## Stage 06 — Persistent Media and Document Storage (2026-11-26)

- Reused the existing PersistentStorageService, media_files schema, MediaFile model, MediaFilePolicy, media API routes, project file endpoints, and message attachment integration.
- Fixed client media-list filter validation so unknown/incomplete owner filters cannot bypass client-scoped file listing.
- Hid internal storage paths, disk names, checksum, ownership keys, and uploader IDs from serialized API metadata.
- Updated React media response validation to use stable public metadata rather than requiring internal storage paths.
- Removed unnecessary uploader email/role fields from media-related API relationships.
- Sanitized uploaded filenames against control-character/header injection and strengthened relative storage-path validation.
- Removed runtime env() fallbacks from the storage service; configured disk selection now uses Laravel config.
- Added security and validation tests and storage operation documentation.
- No new migration was needed. PHPUnit, real MySQL, full React build, and S3 operation remain to be verified in the local development environment.

## Stage 07 — Project file management and attachments

- Reused the existing admin/client project-file interfaces and shared Laravel storage service; no duplicate storage mechanism was added.
- Admin and client project-file list endpoints now validate category against the supported project category list and return private files only.
- Upload and replacement now confirm the object exists on the configured storage disk and that corresponding database metadata can be re-read before returning success.
- File deletion now checks the storage delete result and verifies removal from both storage and MySQL.
- Removed manually supplied multipart Content-Type headers so the browser/Axios can set the correct boundary.
- Added backend category/listing assertions and frontend service tests for file listing, upload, replacement, progress and deletion.
- PHPUnit, npm tests/build and live MySQL/storage checks remain unverified in the packaging environment because `vendor` and `node_modules` are not present.
- See `PROJECT_FILES_STAGE_07_REPORT.md` and `PROJECT_FILES_API.md`.

## Stage 08 — Invoice billing and payment tracking

- Continued from the cumulative Stage 07 package; retained the existing invoice models, invoice/items/payments migrations, billing API, React BillingContext and invoice screens.
- Added an additive `invoice_number_sequences` migration and a transaction/row-lock based yearly invoice number allocator. Existing invoice numbers are checked before issuing the next sequence, and the database unique index remains the final collision safeguard.
- Strengthened invoice amount calculations using integer minor units; line-item totals are computed on the server and browser-submitted totals cannot override a non-empty line-item total.
- Added guarded status transitions, due-date calendar handling, draft-only editing, locked payment recording to prevent concurrent overpayment, and protection against cancellation/deletion when payment history exists.
- Restricted administrative invoice details to billing-authorized administrators. Client invoices use `ClientInvoiceResource`, which omits internal invoice notes, creator identity, internal payment notes and staff recorder identity.
- Client invoice list/details/payment/PDF routes derive ownership from the authenticated Sanctum session and the linked active client profile; they do not trust `client_id` query/body values.
- Added the scoped `/api/invoice-options` endpoint for authorized billing creators/updaters so the invoice form can load client/project options without requiring broad client-management access.
- Updated invoice PDFs to use saved brand name/color and an allowed local public-storage logo reference. Remote logo URLs are not fetched. The invoice shows database-backed client/project, line items, totals, balance and recorded payment history.
- Updated the React billing dashboard to display per-currency totals instead of summing unrelated currencies, and to load invoice form options from the scoped endpoint.
- Cleared prior invoice state before loading a new account's billing records or displaying an error, reducing stale-data exposure after an account switch.
- Expanded backend and frontend tests for lifecycle, invoice numbering, multi-currency summary, prohibited card data, client isolation, private response fields, due-date handling and saved PDF branding.
- No payment gateway or card collection was added. The billing module records manual/offline payment methods only.
- Added `docs/INVOICE_BILLING_STAGE_08_REPORT.md` and `docs/INVOICE_BILLING_API.md`.
- Verification in the packaging environment: 124 PHP files passed `php -l`; five changed/relevant TypeScript/TSX files passed syntax transpilation; billing helper smoke tests passed for currency grouping and prohibited card-field rejection; ZIP integrity passed. Full `npm run lint` was blocked by missing frontend packages/types; `npm test` was blocked because `tsx` is not installed; Laravel PHPUnit was blocked because `laravel/vendor/autoload.php` is absent. MySQL transactions, live PDF rendering, browser authentication and client isolation still require local runtime verification.
- The new invoice-number sequence migration must be applied locally using `php artisan migrate`; do not use `migrate:fresh`.

## Stage 09 — Persistent administrator/client messaging

- Reused the existing conversations, messages, message-attachment pivot, and private media storage tables/services; no new migration was required.
- Separated client-owned thread access from administrative conversation APIs and tightened policy checks for admin view, reply, read, archive, and reopen operations.
- Added the permission-scoped `/api/conversation-options` endpoint for the administrator composer.
- Applied explicit safe serializers to client conversation and message responses, including attachment metadata allow-lists.
- Connected the React admin and client messaging screens to the API, added active-thread polling with page-visibility and overlap guards, and preserved loaded older messages during latest-page refresh.
- Added backend feature coverage for two-client isolation, admin/client lifecycle, read receipts, pagination, archive/reopen, view-only authorization, and private attachment access; expanded frontend messaging tests.
- See `MESSAGING_STAGE_09_REPORT.md` and `MESSAGING_SYSTEM_API.md` for scope and verification details.
