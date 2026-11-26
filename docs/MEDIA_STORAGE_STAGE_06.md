# Media and Private File Storage — Stage 06

## Implementation summary

The repository already contained a shared `PersistentStorageService`, a `media_files` table, `MediaFile` model, `MediaFilePolicy`, media API routes, project-file endpoints, and media feature tests. This stage reuses those components; it does not create a duplicate storage service or a duplicate `media_files` migration.

The configured local disks are:

- **Public assets**: disk `public`, rooted at `laravel/storage/app/public`, exposed through Laravel's `public/storage` symlink. Intended for logos, public portfolio images, and public hero assets.
- **Private files**: disk `local`, rooted at `laravel/storage/app/private`. Intended for client documents, project files, invoices, and message attachments. Downloads are streamed through an authorized API endpoint or issued as short-lived signed URLs.

The `media_files` table stores the file UID, visibility, category, original and stored filenames, disk, storage path, MIME type, extension, size, SHA-256 checksum, polymorphic owner, client relationship, uploader, and timestamps. These storage-internal and ownership fields are now hidden from ordinary API serialization; they remain available to server-side code and database queries.

## API routes

All routes are under the Laravel `/api` prefix.

- `GET /api/media`: list files visible to the authenticated user, with validated filters and pagination.
- `POST /api/media`: upload a public or private file after policy checks.
- `GET /api/media/{fileUid}`: retrieve safe metadata after authorization.
- `GET /api/media/{fileUid}/download`: stream a file after authorization.
- `POST /api/media/{fileUid}/signed-url`: issue a short-lived download capability after authorization.
- `GET /api/media/signed/{fileUid}`: verify the signed URL and stream the file.
- `POST /api/media/{fileUid}/replace` or `PUT /api/media/{fileUid}`: replace an authorized file.
- `DELETE /api/media/{fileUid}`: delete an authorized file and its storage object.
- Project-specific upload/list/replace/delete routes remain in `projects_api.php` and reuse the same storage service.

## Upload restrictions

The service validates the server-detected MIME type against the filename extension, blocks executable and scriptable extensions (including SVG), removes filename control characters, generates a UUID-based storage filename, and applies size limits:

- Public images: 5 MB.
- Public video: 25 MB.
- Private documents and attachments: 15 MB.

Public uploads accept PNG, JPEG, WebP, MP4, and WebM. Private uploads accept PDF, PNG, JPEG, WebP, TXT/CSV, DOCX, XLSX, PPTX, and ZIP. The server remains authoritative; browser validation is only an early UX check.

## Authorization and isolation

- Public site files require an authorized administrative upload permission.
- Private files must be associated with a real client or project resolved by the server.
- Client ownership is derived from the authenticated user's active client profile; browser-supplied IDs are never trusted as proof of ownership.
- Project/message/client file permissions follow the owning module.
- Client listing filters now reject unknown or incomplete `owner_type` / `owner_id` pairs. This closes a prior edge case where an unknown owner type could skip the default client ownership scope.
- Private file metadata no longer exposes disk names, internal storage paths, checksums, owner keys, client IDs, or uploader IDs. The frontend receives a stable file UID and an authorized download URL instead.
- Signed URLs are short-lived bearer capabilities issued only after an authenticated policy check. Anyone holding the URL may use it until expiry; keep the lifetime short and do not log or share these URLs.

## Local setup

For the current local Windows setup, keep:

```env
FILESYSTEM_DISK=local
FILESYSTEM_PUBLIC_DISK=public
FILESYSTEM_PRIVATE_DISK=local
```

Run this once from `laravel/` if the public asset symlink does not exist:

```powershell
php artisan storage:link
```

Ensure the PHP process can write to `laravel/storage` and `laravel/bootstrap/cache`. Keep `laravel/storage/app/private` outside the public web root. Do not expose it through a symlink or web-server alias.

## Production storage

The repository includes an S3 disk configuration, but the current Composer manifest/lock does not include the Flysystem S3 adapter. S3-compatible storage is therefore **configured as an option, not verified as installed or operational in this stage**. Before switching to S3, install and lock the compatible `league/flysystem-aws-s3-v3` dependency in the deployment environment, set the AWS/S3 variables, set `FILESYSTEM_PUBLIC_DISK` and/or `FILESYSTEM_PRIVATE_DISK` to `s3`, and verify signed URL behavior against the selected provider.

Do not use local filesystem storage on an ephemeral/serverless deployment unless the platform explicitly provides persistent storage. For a persistent VM/VPS, the `storage/app` directories survive application process restarts as long as deployments do not delete them. Back up private files and the `media_files` table together.

## Preview URL behavior

Browser `blob:` URLs are temporary previews only. The existing `Settings.tsx` and `AdminProjectFiles.tsx` flows revoke temporary previews after upload/unmount. Invoice PDF downloads also revoke their object URL in a `finally` block. Permanent records use server-issued HTTP(S) URLs and file UIDs, never `blob:` or `data:` URLs.

## Verification status

Static PHP syntax checks were run for this stage. Laravel/PHPUnit integration tests and a real storage restart test were not run in this packaging environment because Composer and the Laravel `vendor/` directory are unavailable here. The existing persistence test re-resolves the storage service and re-reads bytes plus metadata from the fake disk/database; it does not prove survival across an actual operating-system restart. Run the PHPUnit commands in the stage report on the local project before production use.
