<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\MediaFile;
use App\Models\Project;
use App\Models\ProjectUpdate;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class ClientProjectController extends Controller
{
    private function resolveAuthenticatedClient(Request $request): ?Client
    {
        $user = $request->user();
        if (!$user || $user->role !== 'client' || !($user->is_active ?? true) || $user->suspended_at !== null) {
            return null;
        }

        return Client::where('user_id', $user->id)
            ->where('account_status', 'active')
            ->first();
    }

    public function index(Request $request): JsonResponse
    {
        // Always derive client strictly from authenticated session user; never trust clientId from request
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json([
                'success' => false,
                'message' => 'Forbidden: active client account required.',
            ], 403);
        }

        $projects = Project::where('client_id', $client->id)
            ->with([
                'assignedTeamMember:id,name',
                'milestones',
                'clientVisibleTasks.assignee:id,name',
                'clientVisibleUpdates.author:id,name',
                'clientVisibleUpdates.responder:id,name',
            ])
            ->orderByDesc('created_at')
            ->get()
            ->map(fn (Project $project) => $this->serializeClientProject($project));

        return response()->json([
            'success' => true,
            'data' => $projects,
        ]);
    }

    public function show(Request $request, Project $project): JsonResponse
    {
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $this->authorize('view', $project);

        $project->refresh();
        $project->load([
            'assignedTeamMember:id,name',
            'milestones',
            'clientVisibleTasks.assignee:id,name',
            'clientVisibleUpdates.author:id,name',
            'clientVisibleUpdates.responder:id,name',
        ]);

        return response()->json([
            'success' => true,
            'data' => $this->serializeClientProject($project),
        ]);
    }

    public function files(Request $request, Project $project): JsonResponse
    {
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $this->authorize('view', $project);
        abort_unless((int) $project->client_id === (int) $client->id, 403, 'Forbidden.');

        $filters = $request->validate([
            'category' => ['sometimes', 'nullable', 'string', Rule::in(MediaFile::PROJECT_CATEGORIES)],
        ]);

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

    public function respondToApproval(Request $request, Project $project, ProjectUpdate $update): JsonResponse
    {
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $this->authorize('respondToApproval', $project);
        abort_if((int) $update->project_id !== (int) $project->id, 404);
        abort_if($update->is_internal || $update->type !== 'approval_request', 422, 'Invalid approval request.');

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
                    'title' => $validated['decision'] === 'approved' ? 'Client Approved' : 'Client Requested Revisions',
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
        $project->load([
            'assignedTeamMember:id,name',
            'milestones',
            'clientVisibleTasks.assignee:id,name',
            'clientVisibleUpdates.author:id,name',
            'clientVisibleUpdates.responder:id,name',
        ]);

        return response()->json([
            'success' => true,
            'message' => $validated['decision'] === 'approved'
                ? 'Project approval submitted.'
                : 'Revision request submitted.',
            'data' => $this->serializeClientProject($project),
        ]);
    }

    private function serializeClientProject(Project $project): array
    {
        return [
            'id' => $project->id,
            'project_code' => $project->project_code,
            'client_id' => $project->client_id,
            'name' => $project->name,
            'service_category' => $project->service_category,
            'description' => $project->description,
            'start_date' => $project->start_date?->toDateString(),
            'expected_completion_date' => $project->expected_completion_date?->toDateString(),
            'status' => $project->status,
            'priority' => $project->priority,
            'progress_percentage' => $project->progress_percentage,
            'assigned_team_member' => $project->assignedTeamMember,
            'milestones' => $project->milestones->values(),
            'tasks' => $project->clientVisibleTasks->values(),
            'updates' => $project->clientVisibleUpdates->values(),
            'created_at' => $project->created_at?->toIso8601String(),
            'updated_at' => $project->updated_at?->toIso8601String(),
        ];
    }
}
