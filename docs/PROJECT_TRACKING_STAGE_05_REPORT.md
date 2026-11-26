# Project Tracking — Stage 05 Implementation Report

## Scope

Implemented the project-management prompt on top of the cumulative Stage 04 project. The work focused on project assignment integrity, milestone/task validation, admin-versus-client response separation, client-visible data filtering, approval workflow integrity, and the existing React project-management page's assignment-option loading.

No unrelated visual redesign was performed. No database migration was added in this stage.

## Existing functionality preserved

The repository already contained the main project-management domain:

- `Project`, `ProjectMilestone`, `ProjectTask`, and `ProjectUpdate` Eloquent models.
- Project, milestone, task, update, file, and approval routes.
- `ProjectController` and `ClientProjectController`.
- `ProjectPolicy`.
- `ProjectsContext.tsx` and the existing admin/client project components.
- Existing feature tests for ownership, client-visible updates/tasks, progress validation, milestone ordering, and client approval.

These were extended rather than replaced.

## Changes made

### Backend authorization and data protection

- Added `ProjectPolicy::viewAdminDetails()` so administrative project serialization is not available to a client.
- Kept client access on the dedicated `ClientProjectController` serializer, which returns only client-visible tasks and updates.
- Changed administrative approval recording to require project update permission; client responses continue through the dedicated client endpoint.
- Prevented repeated approval decisions from overwriting a previous answer (HTTP 409 when an approval is no longer pending).
- Limited project assignment options to users with create/update/manage project permissions.

### Assignment integrity

- Added `App\Support\ProjectAssignmentRules` for reusable database-backed validation.
- New projects may be assigned only to invited/active client profiles.
- Existing projects can retain their current client association when that account is later suspended, while new reassignment to suspended clients is rejected.
- New staff assignments must point to active, non-suspended `super_admin` or `custom_admin` users.
- Existing inactive assignees may remain unchanged during unrelated project edits, but cannot be newly assigned.
- Task assignees are validated as active administrative team members, not client accounts.

### Project lifecycle and milestones

- Completed projects are normalized to 100% progress during create, update, and status changes.
- Update validation checks the effective start/completion dates, including existing values when one of the fields is omitted.
- Milestone creation allocates the next sort order within a transaction and locks the project to reduce concurrent duplicate positions.
- Milestone reorder requires the complete set of milestone IDs belonging to that project exactly once; partial, duplicate, and foreign IDs are rejected.
- Nested milestone/task operations verify that the supplied child record belongs to the route project.
- Project deletion is rejected with HTTP 409 if project files or invoices are attached, preventing accidental orphaning of stored assets or billing references.

### Frontend integration

- Updated `ProjectsPage.tsx` to load client and team assignment options through the dedicated `/api/projects/assignment-options` endpoint rather than relying on the general clients/team listing endpoints.
- Assignment options are requested only when the current user can create or update projects.
- Added error handling for failed option loading and cancellation-safe state updates.

## Files added

- `laravel/app/Support/ProjectAssignmentRules.php`
- `laravel/tests/Feature/ProjectManagementHardeningTest.php`

## Files updated

- `laravel/app/Http/Requests/StoreProjectRequest.php`
- `laravel/app/Http/Requests/UpdateProjectRequest.php`
- `laravel/app/Policies/ProjectPolicy.php`
- `laravel/routes/projects_api.php`
- `laravel/app/Http/Controllers/Api/ProjectController.php`
- `laravel/app/Http/Controllers/Api/ClientProjectController.php`
- `laravel/tests/Feature/ProjectTrackingTest.php`
- `src/pages/dashboard/ProjectsPage.tsx`

## API behavior added or tightened

- `GET /api/projects/assignment-options` — requires project create/update/manage permission; returns only assignable clients and active administrative team members.
- `GET /api/projects/{project}` — administrative details only; clients must use `/api/client/projects/{project}`.
- `POST /api/projects/{project}/approvals/{update}/respond` — administrative approval action only.
- `POST /api/client/projects/{project}/approvals/{update}/respond` — client-owned approval response only; approval requests are single-use.
- Existing project, milestone, task, update, and file endpoints received additional validation and/or ownership protections as described above.

## Tests added or updated

Added five Feature tests in `ProjectManagementHardeningTest.php` covering:

1. Assignment options authorization and filtering.
2. Suspended-client and non-team assignee rejection, plus valid project/task assignment.
3. Client denial from admin project details and admin approval route, while retaining access to the safe client serializer.
4. Complete, unique, project-scoped milestone reorder validation.
5. Completed projects being saved with 100% progress.

Updated `ProjectTrackingTest.php` to verify that a client cannot submit a second response to an already answered approval request.

## Verification performed in this environment

- PHP syntax lint: **PASS**, 122 PHP files checked with no syntax errors.
- `node --check scripts/generate-sitemap.js`: **PASS** (regression/sanity check; the sitemap script was not a functional target of this stage).
- PHPUnit / Laravel Feature tests: **NOT RUN**. The packaging environment does not contain `laravel/vendor` or Composer.
- MySQL integration tests: **NOT RUN**. No PDO MySQL/SQLite driver or connected MySQL instance is available in the packaging environment.
- React lint/build: **NOT RUN**. `node_modules` is not present in the packaging environment.
- Browser/session tests: **NOT RUN**.

The new Feature tests are included in the project but must be executed in the user's local Windows environment after the cumulative ZIP is installed.

## Local verification commands

From the repository root:

```powershell
npm ci
npm run lint
npm run build
```

From the Laravel directory:

```powershell
composer install
php artisan config:clear
php artisan route:list --path=api/projects
php artisan test --filter=ProjectTrackingTest
php artisan test --filter=ProjectManagementHardeningTest
```

Use the existing configured `my_web` database. Do not run `migrate:fresh`. No migration was added for this stage; inspect `php artisan migrate:status` and do not run migrations unless it reports a pending migration from a previous stage.

## Outstanding limitations

- The project Feature tests have not been executed in this packaging environment.
- Actual MySQL behavior, route middleware wiring, browser behavior, file storage, and cross-client isolation must still be verified locally.
- This stage does not implement real-time notifications or automatic task-completion-based project progress; these were not requested by this prompt.
- This stage does not redesign the dashboard or client portal.

## Status

Code changes for the defined Stage 05 scope are included. Production readiness is **not certified** until Laravel Feature tests, React checks, database tests, and browser-level client-isolation checks pass in the configured local environment.
