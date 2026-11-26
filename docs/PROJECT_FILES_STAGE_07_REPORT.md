# Stage 07 — Project Files and Attachments

## Scope
Connected and hardened the existing project-file workflow using the shared Laravel `PersistentStorageService`. The project already contained an admin file manager, a client file list/preview, a centralized media API service, private storage, signed downloads, metadata records, and client-isolation tests. Those working components were preserved rather than duplicated.

## Existing functionality preserved

- `AdminProjectFiles.tsx`: administrator upload, category selection, upload progress, temporary image preview, list/search/filter, authorized preview/download, replace, and delete confirmation.
- `ClientProjectFiles.tsx`: client-only project file listing, category/search filtering, authorized preview and download. Clients are not given administrative upload/replace/delete controls.
- `FilePreviewModal.tsx`: authorized blob preview for supported images, PDFs and text/CSV, with temporary object URL cleanup.
- `ProjectsContext.tsx` and `mediaService.ts`: shared list/upload/replace/delete operations, CSRF initialization, progress callbacks, and refresh after mutations.
- Laravel project and client project file endpoints, media policy, metadata model, and persistent storage service.

## Changes made

### Backend

1. `ProjectController::files` now validates category against `MediaFile::PROJECT_CATEGORIES` and explicitly limits results to private files owned by the requested project.
2. `ClientProjectController::files` applies the same strict category validation while continuing to derive the client from the authenticated Sanctum user and verify project ownership.
3. `PersistentStorageService::storeUpload` now verifies the uploaded object exists on the configured disk and re-reads the saved metadata record before returning success. It checks the stored byte count and MIME type as well.
4. `PersistentStorageService::replaceUpload` verifies both the replacement object and its updated database metadata before returning success. If confirmation fails, it attempts to restore the previous metadata and removes the unconfirmed replacement object.
5. `PersistentStorageService::deleteFile` now removes the stored object and database metadata within a guarded database transaction, checks the storage deletion result, and verifies both sides are gone before returning success.

### Frontend

1. Removed manually supplied `Content-Type: multipart/form-data` headers from media uploads and replacements. The browser/Axios now supplies the multipart boundary correctly.
2. `listProjectFiles` now rejects malformed API response shapes rather than quietly interpreting them as an empty file list. `ProjectsContext` exposes the resulting error to the UI.
3. Added focused frontend service tests for admin/client project-file endpoints, category payloads, CSRF initialization, upload progress, replacement and deletion routes.

### Tests added/updated

- Extended `laravel/tests/Feature/ProjectFilesTest.php` to verify all supported project-file categories, metadata returned after upload, private-only project file listings, category filters, and invalid category rejection for both admin and client endpoints.
- Added `tests/project-files-frontend.test.ts` and included it in the npm test script.

## Security and ownership behavior

- Project ownership is still derived from the server-side project record; clients cannot set `client_id` for uploaded files.
- Clients retrieve files only through `/api/client/projects/{project}/files`; the client project is resolved from the authenticated user, and ownership is checked against the project.
- File download, preview, signed URL, replacement and deletion remain policy-protected.
- Private files continue to use the private disk and authorized/signed download flows; public website assets remain on the public disk.
- Storage path, disk name, stored filename, checksum, owner model/id, client id and uploader id remain hidden from API serialization.

## Files changed

- `laravel/app/Http/Controllers/Api/ProjectController.php`
- `laravel/app/Http/Controllers/Api/ClientProjectController.php`
- `laravel/app/Services/PersistentStorageService.php`
- `src/services/mediaService.ts`
- `laravel/tests/Feature/ProjectFilesTest.php`
- `tests/project-files-frontend.test.ts` (new)
- `package.json`
- `docs/PROJECT_FILES_STAGE_07_REPORT.md` (new)
- `docs/PROJECT_FILES_API.md` (new)
- `docs/PROJECT_AUDIT_AND_CHANGELOG.md`

## Verification

- PHP syntax: PASS for all 122 PHP files under `laravel/` (including the modified controllers, storage service and feature test).
- TypeScript/TSX syntax transpilation: PASS for the 6 inspected files (`mediaService.ts`, `ProjectsContext.tsx`, both project file components, `FilePreviewModal.tsx`, and the new frontend test).
- `package.json` JSON parsing: PASS.
- PHPUnit: NOT RUN in the packaging environment because `laravel/vendor` is not present.
- `npm test`, `npm run lint` and production build: NOT RUN in the packaging environment because `node_modules` is not present. Global TypeScript checking was attempted; its reported blockers are missing project dependencies/types, not a confirmed full typecheck.
- Live MySQL/storage restart test: NOT RUN here; requires the developer's local Laravel/MySQL runtime and configured storage disk.

No claim is made that the full stage passes runtime integration until the tests are run on the user's machine.

## Local verification commands

From the repository root:

```powershell
npm install
npm run lint
npm test
npm run build
```

From `laravel/`:

```powershell
composer install
php artisan config:clear
php artisan test --filter=ProjectFilesTest
php artisan test --filter=PersistentMediaStorageTest
```

No new migration was added in this stage. Do not run `migrate:fresh`.
