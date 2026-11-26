<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientActivityLog;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Project;
use App\Services\PersistentStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ConversationController extends Controller
{
    /**
     * Minimal, permission-scoped options for the New Conversation composer.
     * This avoids requiring broad view_clients/view_projects access just to
     * start a support thread.
     */
    public function options(): JsonResponse
    {
        $this->authorize('create', Conversation::class);

        $clients = Client::query()
            ->where('account_status', 'active')
            ->orderBy('full_name')
            ->get(['id', 'client_code', 'full_name', 'company_name', 'email']);

        $projects = Project::query()
            ->whereIn('client_id', $clients->pluck('id'))
            ->orderBy('name')
            ->get(['id', 'project_code', 'name', 'client_id']);

        return response()->json([
            'success' => true,
            'data' => [
                'clients' => $clients,
                'projects' => $projects,
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Conversation::class);

        $query = Conversation::query()
            ->with([
                'client:id,client_code,full_name,company_name,email,account_status',
                'project:id,project_code,name,client_id',
                'creator:id,name',
                'latestMessage.sender:id,name,role_id',
                'latestMessage.attachments',
            ])
            ->withCount([
                'messages as unread_count' => fn ($q) => $q
                    ->where('sender_type', 'client')
                    ->whereNull('read_at'),
            ]);

        if ($status = $request->query('status')) {
            if (in_array($status, Conversation::STATUSES, true)) {
                $query->where('status', $status);
            }
        }

        if ($clientId = $request->integer('client_id')) {
            $query->where('client_id', $clientId);
        }

        if ($projectId = $request->integer('project_id')) {
            $query->where('project_id', $projectId);
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search);
            $query->where(function ($q) use ($escaped): void {
                $q->where('subject', 'like', "%{$escaped}%")
                    ->orWhereHas('client', fn ($cq) => $cq
                        ->where('full_name', 'like', "%{$escaped}%")
                        ->orWhere('company_name', 'like', "%{$escaped}%")
                        ->orWhere('client_code', 'like', "%{$escaped}%"))
                    ->orWhereHas('project', fn ($pq) => $pq->where('name', 'like', "%{$escaped}%"));
            });
        }

        $conversations = $query
            ->orderByDesc('last_message_at')
            ->orderByDesc('id')
            ->get();

        $totalUnread = Message::where('sender_type', 'client')
            ->whereNull('read_at')
            ->whereHas('conversation', fn ($q) => $q->where('status', 'open'))
            ->count();

        return response()->json([
            'success' => true,
            'data' => $conversations,
            'meta' => [
                'total_unread_count' => $totalUnread,
            ],
        ]);
    }

    public function unreadSummary(): JsonResponse
    {
        $this->authorize('viewAny', Conversation::class);

        $totalUnread = Message::where('sender_type', 'client')
            ->whereNull('read_at')
            ->whereHas('conversation', fn ($q) => $q->where('status', 'open'))
            ->count();

        return response()->json([
            'success' => true,
            'data' => [
                'total_unread_count' => $totalUnread,
            ],
        ]);
    }

    public function store(Request $request, PersistentStorageService $storage): JsonResponse
    {
        $this->authorize('create', Conversation::class);

        $validated = $request->validate([
            'client_id' => ['required', 'integer', Rule::exists('clients', 'id')->where(fn ($q) => $q->where('account_status', 'active'))],
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')],
            'subject' => ['nullable', 'string', 'max:255'],
            'initial_message' => ['nullable', 'string', 'max:5000'],
            'attachment' => ['nullable', 'file', 'max:15360'],
            'attachments' => ['nullable', 'array', 'max:5'],
            'attachments.*' => ['file', 'max:15360'],
        ]);

        if (!empty($validated['project_id'])) {
            $project = Project::findOrFail((int) $validated['project_id']);
            if ((int) $project->client_id !== (int) $validated['client_id']) {
                throw ValidationException::withMessages([
                    'project_id' => ['Selected project does not belong to the specified client.'],
                ]);
            }
        }

        $uploadedFiles = $this->extractUploadedFiles($request);
        $initialBody = trim((string) ($validated['initial_message'] ?? ''));

        $actor = $request->user();
        $conversation = DB::transaction(function () use ($validated, $initialBody, $uploadedFiles, $actor, $storage): Conversation {
            $now = now();
            $hasInitialContent = $initialBody !== '' || count($uploadedFiles) > 0;

            $conversation = Conversation::create([
                'client_id' => (int) $validated['client_id'],
                'project_id' => !empty($validated['project_id']) ? (int) $validated['project_id'] : null,
                'created_by' => $actor->id,
                'subject' => !empty($validated['subject']) ? trim((string) $validated['subject']) : null,
                'status' => 'open',
                'last_message_at' => $hasInitialContent ? $now : null,
            ]);

            if ($hasInitialContent) {
                $message = Message::create([
                    'conversation_id' => $conversation->id,
                    'sender_id' => $actor->id,
                    'sender_type' => 'admin',
                    'body' => $initialBody !== '' ? $initialBody : null,
                ]);

                $this->attachFilesToMessage($message, $conversation, $uploadedFiles, $actor, $storage);
            }

            ClientActivityLog::create([
                'client_id' => $conversation->client_id,
                'actor_id' => $actor->id,
                'action' => 'conversation_started',
                'description' => 'Started conversation' . ($conversation->subject ? ": {$conversation->subject}" : '.'),
                'created_at' => $now,
            ]);

            return $conversation;
        });

        $conversation->load([
            'client:id,client_code,full_name,company_name,email,account_status',
            'project:id,project_code,name,client_id',
            'creator:id,name',
            'latestMessage.sender:id,name,role_id',
            'latestMessage.attachments',
        ])->loadCount([
            'messages as unread_count' => fn ($q) => $q
                ->where('sender_type', 'client')
                ->whereNull('read_at'),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Conversation created successfully.',
            'data' => $conversation,
        ], 201);
    }

    public function show(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorize('view', $conversation);

        $perPage = max(5, min(50, (int) $request->query('per_page', 25)));
        $paginator = $conversation->messages()
            ->with(['sender:id,name,role_id', 'attachments'])
            ->reorder('id', 'desc')
            ->paginate($perPage);

        $conversation->load([
            'client:id,client_code,full_name,company_name,email,account_status',
            'project:id,project_code,name,client_id',
            'creator:id,name',
        ])->loadCount([
            'messages as unread_count' => fn ($q) => $q
                ->where('sender_type', 'client')
                ->whereNull('read_at'),
        ]);

        return response()->json([
            'success' => true,
            'data' => [
                'conversation' => $conversation,
                'messages' => array_reverse($paginator->items()),
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

    public function sendMessage(
        Request $request,
        Conversation $conversation,
        PersistentStorageService $storage
    ): JsonResponse {
        $this->authorize('sendMessage', $conversation);

        if ($conversation->status === 'archived') {
            return response()->json([
                'success' => false,
                'message' => 'This conversation is archived. Reopen it before sending new messages.',
            ], 422);
        }

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
                'body' => ['Please enter a message or attach at least one valid file.'],
            ]);
        }

        $actor = $request->user();
        $message = DB::transaction(function () use ($conversation, $actor, $body, $uploadedFiles, $storage): Message {
            // Re-check authorization and status under a row lock so an archive
            // operation cannot race with a message being persisted.
            $lockedConversation = Conversation::query()
                ->lockForUpdate()
                ->findOrFail($conversation->id);
            $this->authorize('sendMessage', $lockedConversation);

            $now = now();
            $message = Message::create([
                'conversation_id' => $lockedConversation->id,
                'sender_id' => $actor->id,
                'sender_type' => 'admin',
                'body' => $body !== '' ? $body : null,
            ]);

            $this->attachFilesToMessage($message, $lockedConversation, $uploadedFiles, $actor, $storage);

            $lockedConversation->last_message_at = $now;
            $lockedConversation->save();

            return $message;
        });

        $message->load(['sender:id,name,role_id', 'attachments']);

        return response()->json([
            'success' => true,
            'message' => 'Message persisted.',
            'data' => $message,
        ], 201);
    }

    public function markAsRead(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorize('markRead', $conversation);

        $updated = Message::where('conversation_id', $conversation->id)
            ->where('sender_type', 'client')
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

    public function archive(Request $request, Conversation $conversation): JsonResponse
    {
        $this->authorize('archive', $conversation);

        if ($conversation->status !== 'archived') {
            $conversation->status = 'archived';
            $conversation->archived_at = now();
            $conversation->archived_by = $request->user()->id;
            $conversation->save();
        }

        return response()->json([
            'success' => true,
            'message' => 'Conversation archived.',
            'data' => $conversation->fresh(['client:id,client_code,full_name,company_name,email,account_status', 'project:id,project_code,name,client_id']),
        ]);
    }

    public function reopen(Conversation $conversation): JsonResponse
    {
        $this->authorize('reopen', $conversation);

        if ($conversation->status !== 'open') {
            $conversation->status = 'open';
            $conversation->archived_at = null;
            $conversation->archived_by = null;
            $conversation->save();
        }

        return response()->json([
            'success' => true,
            'message' => 'Conversation reopened.',
            'data' => $conversation->fresh(['client:id,client_code,full_name,company_name,email,account_status', 'project:id,project_code,name,client_id']),
        ]);
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

    /**
     * @param UploadedFile[] $files
     */
    private function attachFilesToMessage(
        Message $message,
        Conversation $conversation,
        array $files,
        $actor,
        PersistentStorageService $storage
    ): void {
        if (empty($files)) {
            return;
        }

        $ownerType = $conversation->project_id ? 'project' : 'client';
        $ownerId = $conversation->project_id ?: $conversation->client_id;

        foreach ($files as $file) {
            $media = $storage->storeUpload(
                $file,
                $actor,
                'private',
                'message_attachment',
                $ownerType,
                (int) $ownerId
            );

            $message->attachments()->attach($media->id, ['created_at' => now()]);
        }
    }
}
