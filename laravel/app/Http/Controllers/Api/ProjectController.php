<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProjectRequest;
use App\Http\Requests\UpdateProjectRequest;
use App\Models\Client;
use App\Models\ClientActivityLog;
use App\Models\MediaFile;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\ProjectTask;
use App\Models\ProjectUpdate;
use App\Models\User;
use App\Support\ProjectAssignmentRules;
use App\Services\PersistentStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ProjectController extends Controller
{
    public function assignmentOptions(): JsonResponse
    {
        $this->authorize('viewAssignmentOptions', Project::class);

        $clients = Client::query()
            ->whereIn('account_status', ['invited', 'active'])
            ->orderBy('full_name')
            ->get([
                'id', 'client_code', 'user_id', 'full_name', 'email', 'phone',
                'company_name', 'address', 'account_status', 'created_at', 'updated_at',
            ]);

        $teamMembers = User::query()
            ->where('is_active', true)
            ->whereNull('suspended_at')
            ->whereHas('roleRecord', fn ($query) => $query->whereIn('slug', ['super_admin', 'custom_admin']))
            ->with('roleRecord:id,slug')
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'role_id'])
            ->map(fn (User $member): array => [
                'id' => $member->id,
                'name' => $member->name,
                'email' => $member->email,
                'role' => $member->roleRecord?->slug,
                'permissions' => [],
                'is_active' => true,
                'email_verified_at' => null,
                'suspended_at' => null,
            ])
            ->values();

        return response()->json([
            'success' => true,
            'data' => [
                'clients' => $clients,
                'team_members' => $teamMembers,
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Project::class);

        $query = Project::query()->with([
            'client:id,client_code,full_name,company_name,account_status',
            'assignedTeamMember:id,name,email,role_id',
            'milestones',
            'tasks.assignee:id,name,email',
            'updates.author:id,name,email',
            'updates.responder:id,name,email',
        ]);

        if ($search = trim((string) $request->query('search', ''))) {
            $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search);
            $query->where(function ($q) use ($escaped): void {
                $q->where('project_code', 'like', "%{$escaped}%")
                    ->orWhere('name', 'like', "%{$escaped}%")
                    ->orWhere('service_category', 'like', "%{$escaped}%")
                    ->orWhereHas('client', fn ($cq) => $cq->where('full_name', 'like', "%{$escaped}%"));
            });
        }

        if ($status = $request->query('status')) {
            if (in_array($status, Project::STATUSES, true)) {
                $query->where('status', $status);
            }
        }

        if ($priority = $request->query('priority')) {
            if (in_array($priority, Project::PRIORITIES, true)) {
                $query->where('priority', $priority);
            }
        }

        if ($clientId = $request->integer('client_id')) {
            $query->where('client_id', $clientId);
        }

        $projects = $query->orderByDesc('created_at')->get();

        return response()->json([
            'success' => true,
            'data' => $projects,
        ]);
    }

    public function store(StoreProjectRequest $request): JsonResponse
    {
        $this->authorize('create', Project::class);

        $validated = $request->validated();
        $actor = $request->user();

        $project = DB::transaction(function () use ($validated, $actor): Project {
            $project = Project::create([
                'client_id' => $validated['client_id'],
                'name' => $validated['name'],
                'title' => $validated['name'],
                'service_category' => $validated['service_category'],
                'description' => $validated['description'] ?? null,
                'summary' => $validated['description'] ?? null,
                'start_date' => $validated['start_date'] ?? null,
                'expected_completion_date' => $validated['expected_completion_date'] ?? null,
                'due_date' => $validated['expected_completion_date'] ?? null,
                'status' => $validated['status'] ?? 'planning',
                'priority' => $validated['priority'] ?? 'medium',
                'progress_percentage' => ($validated['status'] ?? 'planning') === 'completed'
                    ? 100
                    : ($validated['progress_percentage'] ?? 0),
                'assigned_team_member_id' => $validated['assigned_team_member_id'] ?? null,
            ]);

            ClientActivityLog::create([
                'client_id' => $project->client_id,
                'actor_id' => $actor->id,
                'action' => 'project_created',
                'description' => "Created project {$project->project_code} ({$project->name}).",
                'created_at' => now(),
            ]);

            return $project;
        });

        return response()->json([
            'success' => true,
            'message' => 'Project created successfully.',
            'data' => $this->loadFullProject($project),
        ], 201);
    }

    public function show(Project $project): JsonResponse
    {
        // This endpoint serializes private internal notes and hidden tasks.
        // Clients must use /api/client/projects/{project}.
        $this->authorize('viewAdminDetails', $project);

        return response()->json([
            'success' => true,
            'data' => $this->loadFullProject($project),
        ]);
    }

    public function update(UpdateProjectRequest $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $validated = $request->validated();

        DB::transaction(function () use ($project, $validated): void {
            if (isset($validated['name'])) {
                $validated['title'] = $validated['name'];
            }
            if (array_key_exists('description', $validated)) {
                $validated['summary'] = $validated['description'];
            }
            if (array_key_exists('expected_completion_date', $validated)) {
                $validated['due_date'] = $validated['expected_completion_date'];
            }
            if (($validated['status'] ?? $project->status) === 'completed') {
                $validated['progress_percentage'] = 100;
            }

            $project->fill($validated);
            $project->save();
        });

        return response()->json([
            'success' => true,
            'message' => 'Project updated successfully.',
            'data' => $this->loadFullProject($project),
        ]);
    }

    public function updateStatus(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $validated = $request->validate([
            'status' => ['required', 'string', Rule::in(Project::STATUSES)],
            'progress_percentage' => ['sometimes', 'integer', 'min:0', 'max:100'],
        ]);

        $project->status = $validated['status'];
        if ($validated['status'] === 'completed') {
            $project->progress_percentage = 100;
        } elseif (array_key_exists('progress_percentage', $validated)) {
            $project->progress_percentage = $validated['progress_percentage'];
        }
        $project->save();

        return response()->json([
            'success' => true,
            'message' => 'Project status updated.',
            'data' => $this->loadFullProject($project),
        ]);
    }

    public function storeMilestone(Request $request, Project $project): JsonResponse
    {
        $this->authorize('create', $project);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'due_date' => ['nullable', 'date'],
            'status' => ['sometimes', 'in:pending,in_progress,completed'],
        ]);

        DB::transaction(function () use ($project, $validated): void {
            // Serialize order allocation so concurrent requests cannot reuse a sort position.
            Project::query()->whereKey($project->id)->lockForUpdate()->firstOrFail();
            $nextOrder = ((int) $project->milestones()->lockForUpdate()->max('sort_order')) + 1;
            $status = $validated['status'] ?? 'pending';

            ProjectMilestone::create([
                'project_id' => $project->id,
                'title' => $validated['title'],
                'description' => $validated['description'] ?? null,
                'due_date' => $validated['due_date'] ?? null,
                'status' => $status,
                'sort_order' => $nextOrder,
                'completed_at' => $status === 'completed' ? now() : null,
            ]);
        });

        return response()->json([
            'success' => true,
            'message' => 'Milestone added.',
            'data' => $this->loadFullProject($project),
        ], 201);
    }

    public function updateMilestone(Request $request, Project $project, ProjectMilestone $milestone): JsonResponse
    {
        $this->authorize('update', $project);
        abort_if((int) $milestone->project_id !== (int) $project->id, 404);

        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'due_date' => ['nullable', 'date'],
            'status' => ['sometimes', 'in:pending,in_progress,completed'],
        ]);

        if (isset($validated['status'])) {
            $validated['completed_at'] = $validated['status'] === 'completed' ? now() : null;
        }

        $milestone->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Milestone updated.',
            'data' => $this->loadFullProject($project),
        ]);
    }

    public function reorderMilestones(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $validated = $request->validate([
            'milestone_ids' => ['required', 'array', 'min:1'],
            'milestone_ids.*' => ['required', 'integer', 'distinct'],
        ]);

        DB::transaction(function () use ($project, $validated): void {
            Project::query()->whereKey($project->id)->lockForUpdate()->firstOrFail();

            $existingIds = $project->milestones()
                ->lockForUpdate()
                ->pluck('id')
                ->map(fn ($id): int => (int) $id)
                ->sort()
                ->values()
                ->all();

            $submittedIds = array_map('intval', $validated['milestone_ids']);
            $comparisonIds = $submittedIds;
            sort($comparisonIds);

            if (count($submittedIds) !== count($existingIds) || $comparisonIds !== $existingIds) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'milestone_ids' => ['The reorder list must contain every milestone for this project exactly once.'],
                ]);
            }

            foreach ($submittedIds as $index => $milestoneId) {
                ProjectMilestone::query()
                    ->where('project_id', $project->id)
                    ->whereKey($milestoneId)
                    ->update(['sort_order' => $index + 1]);
            }
        });

        return response()->json([
            'success' => true,
            'message' => 'Milestones reordered.',
            'data' => $this->loadFullProject($project),
        ]);
    }

    public function destroyMilestone(Project $project, ProjectMilestone $milestone): JsonResponse
    {
        $this->authorize('delete', $project);
        abort_if((int) $milestone->project_id !== (int) $project->id, 404);
        $milestone->delete();

        return response()->json([
            'success' => true,
            'message' => 'Milestone deleted.',
            'data' => $this->loadFullProject($project),
        ]);
    }

    public function storeTask(Request $request, Project $project): JsonResponse
    {
        $this->authorize('create', $project);

        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'milestone_id' => [
                'nullable',
                'integer',
                Rule::exists('project_milestones', 'id')->where('project_id', $project->id),
            ],
            'assigned_to' => ['nullable', 'integer', ProjectAssignmentRules::activeTeamMember()],
            'status' => ['sometimes', 'in:todo,in_progress,review,done'],
            'deadline' => ['nullable', 'date'],
            'is_client_visible' => ['sometimes', 'boolean'],
        ]);

        ProjectTask::create([
            'project_id' => $project->id,
            'milestone_id' => $validated['milestone_id'] ?? null,
            'assigned_to' => $validated['assigned_to'] ?? null,
            'title' => $validated['title'],
            'description' => $validated['description'] ?? null,
            'status' => $validated['status'] ?? 'todo',
            'deadline' => $validated['deadline'] ?? null,
            'is_client_visible' => $validated['is_client_visible'] ?? true,
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Task created.',
            'data' => $this->loadFullProject($project),
        ], 201);
    }

    public function updateTask(Request $request, Project $project, ProjectTask $task): JsonResponse
    {
        $this->authorize('update', $project);
        abort_if((int) $task->project_id !== (int) $project->id, 404);

        $validated = $request->validate([
            'title' => ['sometimes', 'required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'milestone_id' => [
                'nullable',
                'integer',
                Rule::exists('project_milestones', 'id')->where('project_id', $project->id),
            ],
            'assigned_to' => ['nullable', 'integer', ProjectAssignmentRules::activeTeamMemberForUpdate($task->assigned_to)],
            'status' => ['sometimes', 'in:todo,in_progress,review,done'],
            'deadline' => ['nullable', 'date'],
            'is_client_visible' => ['sometimes', 'boolean'],
        ]);

        $task->update($validated);

        return response()->json([
            'success' => true,
            'message' => 'Task updated.',
            'data' => $this->loadFullProject($project),
        ]);
    }

    public function destroyTask(Project $project, ProjectTask $task): JsonResponse
    {
        $this->authorize('delete', $project);
        abort_if((int) $task->project_id !== (int) $project->id, 404);
        $task->delete();

        return response()->json([
            'success' => true,
            'message' => 'Task deleted.',
            'data' => $this->loadFullProject($project),
        ]);
    }

    public function storeUpdate(Request $request, Project $project): JsonResponse
    {
        $this->authorize('update', $project);

        $validated = $request->validate([
            'title' => ['nullable', 'string', 'max:255'],
            'body' => ['required', 'string', 'max:5000'],
            'is_internal' => ['sometimes', 'boolean'],
            'request_approval' => ['sometimes', 'boolean'],
        ]);

        $isInternal = (bool) ($validated['is_internal'] ?? false);
        $requestApproval = !$isInternal && (bool) ($validated['request_approval'] ?? false);

        DB::transaction(function () use ($project, $request, $validated, $isInternal, $requestApproval): void {
            ProjectUpdate::create([
                'project_id' => $project->id,
                'author_id' => $request->user()->id,
                'type' => $isInternal
                    ? 'internal_note'
                    : ($requestApproval ? 'approval_request' : 'progress_update'),
                'title' => $validated['title'] ?? null,
                'body' => $validated['body'],
                'is_internal' => $isInternal,
                'approval_status' => $requestApproval ? 'pending' : null,
            ]);

            if ($requestApproval) {
                $project->status = 'waiting_for_client';
                $project->save();
            }
        });

        return response()->json([
            'success' => true,
            'message' => $isInternal
                ? 'Private internal note saved.'
                : ($requestApproval ? 'Client approval requested.' : 'Progress update posted.'),
            'data' => $this->loadFullProject($project),
        ], 201);
    }

    public function recordApprovalDecision(Request $request, Project $project, ProjectUpdate $update): JsonResponse
    {
        // This administrative endpoint must never use the client ownership ability.
        $this->authorize('update', $project);
        abort_if((int) $update->project_id !== (int) $project->id, 404);
        abort_if($update->is_internal || $update->type !== 'approval_request', 422, 'Selected item is not an approval request.');

        $validated = $request->validate([
            'decision' => ['required', 'in:approved,changes_requested'],
            'comment' => ['nullable', 'string', 'max:2000'],
        ]);

        DB::transaction(function () use ($project, $update, $request, $validated): void {
            $lockedProject = Project::query()->whereKey($project->id)->lockForUpdate()->firstOrFail();
            $lockedUpdate = ProjectUpdate::query()
                ->whereKey($update->id)
                ->where('project_id', $lockedProject->id)
                ->lockForUpdate()
                ->firstOrFail();

            abort_if($lockedUpdate->is_internal || $lockedUpdate->type !== 'approval_request', 422, 'Invalid approval request.');
            abort_unless($lockedUpdate->approval_status === 'pending', 409, 'This approval request has already been answered.');

            $lockedUpdate->approval_status = $validated['decision'];
            $lockedUpdate->responded_by = $request->user()->id;
            $lockedUpdate->responded_at = now();
            $lockedUpdate->save();

            if (!empty($validated['comment'])) {
                ProjectUpdate::create([
                    'project_id' => $lockedProject->id,
                    'author_id' => $request->user()->id,
                    'type' => 'client_decision',
                    'title' => $validated['decision'] === 'approved' ? 'Approval Recorded' : 'Revisions Requested',
                    'body' => $validated['comment'],
                    'is_internal' => false,
                    'approval_status' => $validated['decision'],
                    'responded_by' => $request->user()->id,
                    'responded_at' => now(),
                ]);
            }

            if ($validated['decision'] === 'approved' && $lockedProject->status === 'waiting_for_client') {
                $lockedProject->status = 'in_progress';
                $lockedProject->save();
            } elseif ($validated['decision'] === 'changes_requested') {
                $lockedProject->status = 'under_review';
                $lockedProject->save();
            }
        });

        $project->refresh();

        return response()->json([
            'success' => true,
            'message' => 'Approval decision recorded.',
            'data' => $this->loadFullProject($project),
        ]);
    }

    public function destroy(Project $project): JsonResponse
    {
        $this->authorize('delete', $project);

        // Do not cascade-delete contractual or stored client assets implicitly.
        if ($project->files()->exists() || DB::table('invoices')->where('project_id', $project->id)->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'This project has attached files or invoices. Remove or reassign those records before deleting the project.',
            ], 409);
        }

        DB::transaction(function () use ($project): void {
            $project->delete();
        });

        return response()->json([
            'success' => true,
            'message' => 'Project deleted.',
        ]);
    }

    public function files(Request $request, Project $project): JsonResponse
    {
        $this->authorize('viewAdminDetails', $project);
        $this->authorize('viewAny', MediaFile::class);

        $filters = $request->validate([
            'category' => ['sometimes', 'nullable', 'string', Rule::in(MediaFile::PROJECT_CATEGORIES)],
        ]);

        // Project file lists must never include public assets or unrelated media records.
        $query = MediaFile::where('visibility', 'private')
            ->where('owner_type', Project::class)
            ->where('owner_id', $project->id)
            ->with('uploader:id,name')
            ->orderByDesc('created_at');

        if (!empty($filters['category'])) {
            $query->where('category', $filters['category']);
        }

        return response()->json([
            'success' => true,
            'data' => $query->get(),
        ]);
    }

    public function storeFile(
        Request $request,
        Project $project,
        PersistentStorageService $storage
    ): JsonResponse {
        $this->authorize('update', $project);
        $this->authorize('uploadPrivate', MediaFile::class);

        $validated = $request->validate([
            'file' => ['required', 'file'],
            'category' => ['required', 'string', Rule::in(MediaFile::PROJECT_CATEGORIES)],
        ]);

        // Ownership & client_id are always resolved server-side from $project (never browser client_id)
        $mediaFile = $storage->storeUpload(
            $request->file('file'),
            $request->user(),
            'private',
            $validated['category'],
            'project',
            $project->id
        );

        ClientActivityLog::create([
            'client_id' => $project->client_id,
            'actor_id' => $request->user()->id,
            'action' => 'project_file_uploaded',
            'description' => "Uploaded {$mediaFile->original_filename} ({$mediaFile->category}) to {$project->project_code}.",
            'created_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Project file uploaded.',
            'data' => $mediaFile,
        ], 201);
    }

    public function replaceFile(
        Request $request,
        Project $project,
        string $fileUid,
        PersistentStorageService $storage
    ): JsonResponse {
        $this->authorize('update', $project);

        $mediaFile = MediaFile::where('file_uid', $fileUid)
            ->where('visibility', 'private')
            ->where('owner_type', Project::class)
            ->where('owner_id', $project->id)
            ->firstOrFail();

        $this->authorize('replace', $mediaFile);

        $validated = $request->validate([
            'file' => ['required', 'file'],
            'category' => ['nullable', 'string', Rule::in(MediaFile::PROJECT_CATEGORIES)],
        ]);

        $updated = $storage->replaceUpload(
            $mediaFile,
            $request->file('file'),
            $request->user(),
            $validated['category'] ?? null
        );

        ClientActivityLog::create([
            'client_id' => $project->client_id,
            'actor_id' => $request->user()->id,
            'action' => 'project_file_replaced',
            'description' => "Replaced file {$updated->original_filename} in {$project->project_code}.",
            'created_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Project file replaced.',
            'data' => $updated,
        ]);
    }

    public function destroyFile(
        Request $request,
        Project $project,
        string $fileUid,
        PersistentStorageService $storage
    ): JsonResponse {
        $this->authorize('viewAdminDetails', $project);

        $mediaFile = MediaFile::where('file_uid', $fileUid)
            ->where('visibility', 'private')
            ->where('owner_type', Project::class)
            ->where('owner_id', $project->id)
            ->firstOrFail();

        $this->authorize('delete', $mediaFile);

        $filename = $mediaFile->original_filename;
        $storage->deleteFile($mediaFile);

        ClientActivityLog::create([
            'client_id' => $project->client_id,
            'actor_id' => $request->user()->id,
            'action' => 'project_file_deleted',
            'description' => "Deleted file {$filename} from {$project->project_code}.",
            'created_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'message' => 'Project file deleted.',
        ]);
    }

    private function loadFullProject(Project $project): Project
    {
        return $project->fresh([
            'client:id,client_code,full_name,company_name,account_status',
            'assignedTeamMember:id,name,email,role_id',
            'milestones',
            'tasks.assignee:id,name,email',
            'updates.author:id,name,email',
            'updates.responder:id,name,email',
        ]);
    }
}
