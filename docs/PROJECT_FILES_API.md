# Project Files API Contract

All routes below are served by Laravel under the `/api` prefix and require a valid Sanctum session unless marked otherwise.

| Method | Endpoint | Purpose | Authorization |
|---|---|---|---|
| GET | `/api/projects/{project}/files` | List private files attached to a project | Admin project-view permission; optional category must be a supported project category |
| POST | `/api/projects/{project}/files` | Upload a project file | Project update permission plus private-upload policy |
| POST | `/api/projects/{project}/files/{fileUid}/replace` | Replace a project file | Project update permission and file replace policy |
| DELETE | `/api/projects/{project}/files/{fileUid}` | Delete a project file | File delete policy |
| GET | `/api/client/projects/{project}/files` | List files for the authenticated client's own project | Active client account; project ownership derived from session |
| GET | `/api/media/{fileUid}/download` | Stream an authorized file | MediaFilePolicy `view` |
| POST | `/api/media/{fileUid}/signed-url` | Issue short-lived download capability after authorization | MediaFilePolicy `view` |
| GET | `/api/media/signed/{fileUid}` | Complete signed download | Valid unexpired signed URL; the URL is a short-lived bearer capability |

## Supported project file categories

- `contract`
- `requirement`
- `design`
- `report`
- `document`
- `deliverable`
- `attachment`

## Upload payload

`multipart/form-data` with:

- `file`: required uploaded file.
- `category`: required supported project-file category.

Do not send `client_id`, `owner_type`, or `owner_id` from the browser for the project-scoped endpoint. Laravel derives those fields from the route-bound project record.

## Response metadata

The API returns the stable file UID, original filename, MIME type, extension, byte size, category, uploader summary, timestamps and an authorized/permanent URL reference. Internal storage disk/path, stored filename, checksum, owner identifiers and uploader ID are not exposed.

## Access rules

- Client project listing uses the authenticated user's active client profile; browser-supplied client IDs are not trusted.
- Clients can list, preview and download files belonging to their own project only.
- Clients cannot upload, replace or delete administrator-managed project deliverables through the project files endpoints.
- Custom administrators must possess the appropriate project module permission; view-only access does not grant upload, replacement or deletion.
- Private documents are never served through an unrestricted public storage URL.
