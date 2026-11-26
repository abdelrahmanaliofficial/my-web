<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\Conversation;
use App\Models\Message;
use App\Services\PersistentStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ClientConversationController extends Controller
{
    private function resolveAuthenticatedClient(Request $request): ?Client
    {
        $user = $request->user();
        if (!$user || !$user->isActive() || !$user->hasRole('client')) {
            return null;
        }

        return Client::where('user_id', $user->id)
            ->where('account_status', 'active')
            ->first();
    }

    public function index(Request $request): JsonResponse
    {
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden: active client account required.',
            ], 403);
        }

        $query = Conversation::where('client_id', $client->id)
            ->with([
                'project:id,project_code,name,client_id',
                'latestMessage.sender:id,name,role_id',
                'latestMessage.attachments',
            ])
            ->withCount([
                'messages as unread_count' => fn ($q) => $q
                    ->where('sender_type', 'admin')
                    ->whereNull('read_at'),
            ]);

        if ($status = $request->query('status')) {
            if (in_array($status, Conversation::STATUSES, true)) {
                $query->where('status', $status);
            }
        }

        $conversations = $query
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->get()
            ->map(fn (Conversation $conversation): array => $this->serializeConversation($conversation))
            ->values();

        $totalUnread = Message::where('sender_type', 'admin')
            ->whereNull('read_at')
            ->whereHas('conversation', fn ($q) => $q
                ->where('client_id', $client->id)
                ->where('status', 'open'))
            ->count();

        return response()->json([
            'success' => true,
            'data' => $conversations,
            'meta' => [
                'total_unread_count' => $totalUnread,
            ],
        ]);
    }

    public function unreadSummary(Request $request): JsonResponse
    {
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $totalUnread = Message::where('sender_type', 'admin')
            ->whereNull('read_at')
            ->whereHas('conversation', fn ($q) => $q
                ->where('client_id', $client->id)
                ->where('status', 'open'))
            ->count();

        return response()->json([
            'success' => true,
            'data' => [
                'total_unread_count' => $totalUnread,
            ],
        ]);
    }

    public function show(Request $request, Conversation $conversation): JsonResponse
    {
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        abort_unless((int) $conversation->client_id === (int) $client->id, 403, 'Forbidden.');
        $this->authorize('viewOwn', $conversation);

        $perPage = max(5, min(50, (int) $request->query('per_page', 25)));
        $paginator = $conversation->messages()
            ->with(['sender:id,name,role_id', 'attachments'])
            ->reorder('id', 'desc')
            ->paginate($perPage);

        $conversation->load(['project:id,project_code,name,client_id'])
            ->loadCount([
                'messages as unread_count' => fn ($q) => $q
                    ->where('sender_type', 'admin')
                    ->whereNull('read_at'),
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'conversation' => $this->serializeConversation($conversation),
                'messages' => array_map(
                    fn (Message $message): array => $this->serializeMessage($message),
                    array_reverse($paginator->items())
                ),
                'pagination' => [
                    'current_page' => $paginator->currentPage(),
                    'last_page' => $paginator->lastPage(),
                    'per_page' => $paginator->perPage(),
                    'total' => $paginator->total(),
                    'has_more' => $paginator->hasMorePages(),
                ],
            ],
        ]);
    }

    public function reply(
        Request $request,
        Conversation $conversation,
        PersistentStorageService $storage
    ): JsonResponse {
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        abort_unless((int) $conversation->client_id === (int) $client->id, 403, 'Forbidden.');

        if ($conversation->status === 'archived') {
            return response()->json([
                'success' => false,
                'message' => 'This conversation has been archived and can no longer receive replies.',
            ], 422);
        }

        $this->authorize('replyOwn', $conversation);

        $validated = $request->validate([
            'body' => ['nullable', 'string', 'max:5000'],
            'attachment' => ['nullable', 'file', 'max:15360'],
            'attachments' => ['nullable', 'array', 'max:5'],
            'attachments.*' => ['file', 'max:15360'],
        ]);

        $body = trim((string) ($validated['body'] ?? ''));
        $uploadedFiles = $this->extractUploadedFiles($request);

        if ($body === '' && count($uploadedFiles) === 0) {
            throw ValidationException::withMessages([
                'body' => ['Please enter a reply or attach at least one valid file.'],
            ]);
        }

        $actor = $request->user();
        $message = DB::transaction(function () use ($conversation, $client, $actor, $body, $uploadedFiles, $storage): Message {
            // Lock and re-validate ownership/status inside the write transaction.
            $lockedConversation = Conversation::query()
                ->lockForUpdate()
                ->findOrFail($conversation->id);
            abort_unless((int) $lockedConversation->client_id === (int) $client->id, 403, 'Forbidden.');
            $this->authorize('replyOwn', $lockedConversation);

            $now = now();
            $message = Message::create([
                'conversation_id' => $lockedConversation->id,
                'sender_id' => $actor->id,
                'sender_type' => 'client',
                'body' => $body !== '' ? $body : null,
            ]);

            if (!empty($uploadedFiles)) {
                $ownerType = $lockedConversation->project_id ? 'project' : 'client';
                $ownerId = $lockedConversation->project_id ?: $client->id;

                foreach ($uploadedFiles as $file) {
                    $media = $storage->storeUpload(
                        $file,
                        $actor,
                        'private',
                        'message_attachment',
                        $ownerType,
                        (int) $ownerId
                    );
                    $message->attachments()->attach($media->id, ['created_at' => $now]);
                }
            }

            $lockedConversation->last_message_at = $now;
            $lockedConversation->save();

            return $message;
        });

        $message->load(['sender:id,name,role_id', 'attachments']);

        return response()->json([
            'success' => true,
            'message' => 'Reply persisted.',
            'data' => $this->serializeMessage($message),
        ], 201);
    }

    public function markAsRead(Request $request, Conversation $conversation): JsonResponse
    {
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        abort_unless((int) $conversation->client_id === (int) $client->id, 403, 'Forbidden.');
        $this->authorize('markReadOwn', $conversation);

        $updated = Message::where('conversation_id', $conversation->id)
            ->where('sender_type', 'admin')
            ->whereNull('read_at')
            ->update([
                'read_at' => now(),
                'read_by' => $request->user()->id,
            ]);

        return response()->json([
            'success' => true,
            'data' => [
                'conversation_id' => $conversation->id,
                'updated_count' => $updated,
                'unread_count' => 0,
            ],
        ]);
    }

    /**
     * Client-facing allow-list. Internal admin IDs and ownership metadata are
     * deliberately omitted even though the underlying records are authorized.
     */
    private function serializeConversation(Conversation $conversation): array
    {
        $project = $conversation->relationLoaded('project') ? $conversation->project : null;
        $latest = $conversation->relationLoaded('latestMessage') ? $conversation->latestMessage : null;

        return [
            'id' => (int) $conversation->id,
            'client_id' => (int) $conversation->client_id,
            'project_id' => $conversation->project_id ? (int) $conversation->project_id : null,
            'subject' => $conversation->subject,
            'status' => $conversation->status,
            'last_message_at' => $conversation->last_message_at?->toISOString(),
            'archived_at' => $conversation->archived_at?->toISOString(),
            'created_at' => $conversation->created_at?->toISOString(),
            'updated_at' => $conversation->updated_at?->toISOString(),
            'unread_count' => (int) ($conversation->unread_count ?? 0),
            'project' => $project ? [
                'id' => (int) $project->id,
                'project_code' => $project->project_code,
                'name' => $project->name,
                'client_id' => (int) $project->client_id,
            ] : null,
            'latest_message' => $latest ? $this->serializeMessage($latest) : null,
        ];
    }

    /** @return array<string, mixed> */
    private function serializeMessage(Message $message): array
    {
        $sender = $message->relationLoaded('sender') ? $message->sender : null;
        $attachments = $message->relationLoaded('attachments') ? $message->attachments : collect();

        return [
            'id' => (int) $message->id,
            'conversation_id' => (int) $message->conversation_id,
            'sender_type' => $message->sender_type,
            'body' => $message->body,
            'read_at' => $message->read_at?->toISOString(),
            'is_read' => $message->read_at !== null,
            'created_at' => $message->created_at?->toISOString(),
            'updated_at' => $message->updated_at?->toISOString(),
            'sender' => $sender ? [
                'id' => (int) $sender->id,
                'name' => $sender->name,
            ] : null,
            'attachments' => $attachments->map(fn ($file): array => [
                'id' => (int) $file->id,
                'file_uid' => $file->file_uid,
                'visibility' => $file->visibility,
                'category' => $file->category,
                'original_filename' => $file->original_filename,
                'mime_type' => $file->mime_type,
                'extension' => $file->extension,
                'file_size' => (int) $file->file_size,
                'url' => $file->url,
                'created_at' => $file->created_at?->toISOString(),
                'updated_at' => $file->updated_at?->toISOString(),
            ])->values()->all(),
        ];
    }

    /**
     * @return UploadedFile[]
     */
    private function extractUploadedFiles(Request $request): array
    {
        $files = [];
        if ($request->hasFile('attachment')) {
            $single = $request->file('attachment');
            if ($single instanceof UploadedFile) {
                $files[] = $single;
            }
        }
        if ($request->hasFile('attachments')) {
            foreach ((array) $request->file('attachments') as $item) {
                if ($item instanceof UploadedFile) {
                    $files[] = $item;
                }
            }
        }
        if (count($files) > 5) {
            throw ValidationException::withMessages([
                'attachments' => ['No more than five files may be attached to one message.'],
            ]);
        }

        return $files;
    }
}
