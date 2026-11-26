# Messaging System API — Stage 09

All routes below require an authenticated Sanctum session and an active account. Routes are registered from `routes/messages_api.php` under `/api`.

## Administrative endpoints

| Method | Endpoint | Permission / behavior |
|---|---|---|
| GET | `/api/conversation-options` | `create_messages` or `manage_messages`; active clients and their projects for the new-conversation form |
| GET | `/api/conversations` | `view_messages` or `manage_messages`; list, optional `status`, `client_id`, `project_id`, and `search` filters |
| GET | `/api/conversations/unread-summary` | `view_messages` or `manage_messages`; total unread client messages in open conversations |
| POST | `/api/conversations` | `create_messages` or `manage_messages`; creates a conversation and optional initial message/files |
| GET | `/api/conversations/{conversation}` | `view_messages` or `manage_messages`; conversation plus paginated message history |
| POST | `/api/conversations/{conversation}/messages` | Requires conversation view plus `create_messages`, `update_messages`, or `manage_messages`; only open conversations |
| POST | `/api/conversations/{conversation}/read` | `view_messages` or `manage_messages`; marks incoming client messages as read |
| POST | `/api/conversations/{conversation}/archive` | Requires conversation view plus `update_messages` or `manage_messages` |
| POST | `/api/conversations/{conversation}/reopen` | Same authorization as archive |

### Create conversation payload

JSON fields:

- `client_id` — required active client ID.
- `project_id` — optional project ID; when supplied, it must belong to `client_id`.
- `subject` — optional string, maximum 255 characters.
- `initial_message` — optional string, maximum 5,000 characters.
- Optional upload field `attachment` or `attachments[]` for message files.

A conversation may be created with a subject and without an initial message. If an initial message or at least one attachment is provided, the server creates the first message in the same database transaction.

### Send message payload

- `body` — optional string, maximum 5,000 characters.
- Optional `attachment` or `attachments[]` files.
- At least a non-empty body or one attachment is required.
- Maximum five combined files per message.

## Client endpoints

The client identity is derived exclusively from the authenticated user and their active `clients.user_id` record. Client requests cannot select another `client_id` by query or payload.

| Method | Endpoint | Behavior |
|---|---|---|
| GET | `/api/client/conversations` | List only the authenticated client's conversations; optional `status` filter |
| GET | `/api/client/conversations/unread-summary` | Count unread administrator messages in that client's open conversations |
| GET | `/api/client/conversations/{conversation}` | Own conversation and paginated history |
| POST | `/api/client/conversations/{conversation}/messages` | Reply only to the client's own open conversation |
| POST | `/api/client/conversations/{conversation}/read` | Mark incoming administrator messages as read |

Client endpoints return allow-listed fields. They do not serialize internal `sender_id`, `read_by`, staff ownership metadata, or private storage paths. A client attempting to access another client's conversation receives HTTP 403. A client using an administrative conversation endpoint also receives HTTP 403, including when the conversation is their own.

Archived conversations remain visible in history but cannot receive replies; attempting to reply returns HTTP 422. Only an authorized administrator can archive or reopen a conversation.

## Pagination and ordering

Both administrative and client conversation show endpoints accept:

- `page` — page number, default 1.
- `per_page` — clamped to 5–50, default 25.

Messages are queried newest-first for pagination and returned in chronological ascending order within each page. The response includes `current_page`, `last_page`, `per_page`, `total`, and `has_more`.

## Read receipts and unread counts

- For administrators, unread messages are incoming `sender_type=client` messages in open conversations.
- For clients, unread messages are incoming `sender_type=admin` messages in that client's open conversations.
- Calling the respective `/read` endpoint updates `read_at` and `read_by` for incoming messages in that conversation.
- List responses include per-conversation `unread_count`; list metadata includes `total_unread_count`.

## Attachments

Uploads use the existing `PersistentStorageService` with `visibility=private` and `category=message_attachment`. The media-file row is linked to the message through `message_attachments`. For a project-linked conversation, the attachment owner is that project; otherwise, its owner is the client profile. Client uploads are bound to the authenticated client/project by the storage service.

Allowed private formats follow the shared private storage policy: PDF, PNG, JPEG, WebP, TXT/CSV, DOCX, XLSX, PPTX, and ZIP. Maximum file size is 15 MiB and maximum attachment count is five per message. Executables, scripts, HTML, and SVG are blocked by the shared storage validator.

Private attachment URLs point to `/api/media/{fileUid}/download`, not a public disk path. The media policy checks message-module permission for administrators or exact client/project ownership for a client before streaming the file.

## Polling

The React application polls conversation summaries and the active thread every ten seconds while the document is visible. It skips hidden-tab polling and prevents overlapping active-thread refreshes. No WebSocket/broadcasting service is required.
