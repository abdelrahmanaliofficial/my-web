# Stage 06 — Persistent Media and Document Storage

## Scope

Implemented the requested storage-security improvements on the cumulative Stage 05 project. The repository already contained the principal storage architecture, so this stage hardened and completed that implementation rather than duplicating it.

## Existing components retained

- `app/Services/PersistentStorageService.php`
- `app/Models/MediaFile.php`
- `app/Http/Controllers/Api/MediaFileController.php`
- `app/Policies/MediaFilePolicy.php`
- `routes/media_api.php`
- Existing `media_files` and `client_id` migrations
- Project file and message attachment integrations
- Existing temporary preview handling in React

No new migration was required because the required metadata columns and client association already exist in the supplied database schema.

## Changes made

1. **Fixed client media-list filter validation.** Unknown `owner_type` values and incomplete `owner_type` / `owner_id` pairs now return validation errors instead of potentially bypassing the default client-scoped query.
2. **Reduced API metadata exposure.** Internal fields (`stored_filename`, `disk`, `storage_path`, `checksum_sha256`, `owner_type`, `owner_id`, `client_id`, and `uploaded_by`) are hidden from serialized `MediaFile` responses while remaining stored and usable server-side.
3. **Updated the frontend media contract.** `mediaService` now verifies a stable file UID, original filename, detected MIME type, and server-issued permanent URL rather than requiring the internal storage path to be exposed. Internal storage fields are optional in the TypeScript metadata type for compatibility.
4. **Reduced uploader information exposure.** API relationships return uploader ID and display name only, not uploader email or role identifiers.
5. **Hardened original filenames.** Control characters are removed before filenames are saved or used in response headers, reducing header-injection risk.
6. **Hardened storage paths.** Absolute paths, Windows drive paths, URI-like paths, traversal segments, and duplicate separators are rejected.
7. **Removed runtime `env()` fallbacks from the storage service.** Disk selection now reads values from Laravel's configuration, compatible with config caching.
8. **Expanded tests.** Added tests for invalid/incomplete client owner filters, safe API metadata serialization, filename control-character removal, and storage-path rejection. Updated existing file tests to inspect internal paths and owner IDs through the database rather than the public API response.
9. **Documented operations.** Added `docs/MEDIA_STORAGE_STAGE_06.md`, including local storage setup, route inventory, file policies, and the S3 adapter prerequisite.

## Tests and checks

- PHP syntax: **PASS**, 122 PHP files parsed with `php -l`.
- JavaScript syntax: **PASS**, `scripts/generate-sitemap.js` parsed with `node --check`.
- TypeScript/TSX syntax: **PASS**, the 3 changed files were parsed/transpiled with the installed TypeScript compiler API (syntax check only; not a full project type-check).
- Composer manifest JSON: **PASS**, `laravel/composer.json` parses.
- Laravel PHPUnit tests: **NOT RUN** in this packaging environment because Composer and `laravel/vendor/` are unavailable here. The new/updated feature tests are included in the ZIP.
- MySQL persistence and a true process-restart test: **NOT RUN** here.
- Full React/Vite type-check/build: **NOT RUN** because `node_modules/` is not present.
- S3 compatibility: **NOT VERIFIED**; the current Composer manifest/lock does not include the Flysystem S3 adapter. Local public/private disks remain the configured development storage.

## Required local verification

From `laravel/` after installing dependencies:

```powershell
php artisan test --filter=PersistentMediaStorageTest
php artisan test --filter=ProjectFilesTest
```

Also verify `php artisan storage:link` and upload/download a public image plus a private client document on the local MySQL/storage instance. Do not run destructive migrations; no new migration was added in this stage.
