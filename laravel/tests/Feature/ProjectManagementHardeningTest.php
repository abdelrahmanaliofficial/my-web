<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Project;
use App\Models\ProjectMilestone;
use App\Models\ProjectUpdate;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectManagementHardeningTest extends TestCase
{
    use RefreshDatabase;

    private function makeClient(string $name, string $email, string $status = 'active', ?User $user = null): Client
    {
        return Client::create([
            'user_id' => $user?->id,
            'full_name' => $name,
            'email' => $email,
            'account_status' => $status,
        ]);
    }

    private function makeProject(Client $client, array $overrides = []): Project
    {
        return Project::create(array_merge([
            'client_id' => $client->id,
            'name' => 'Project ' . $client->full_name,
            'service_category' => 'Marketing Strategy',
            'status' => 'planning',
            'priority' => 'medium',
            'progress_percentage' => 0,
        ], $overrides));
    }

    public function test_project_assignment_options_require_project_permission_and_only_return_assignable_records(): void
    {
        $creator = User::factory()->create([
            'role' => 'custom_admin',
            'is_active' => true,
            'suspended_at' => null,
        ]);
        $creator->syncPermissions(['create_projects']);

        $activeClientUser = User::factory()->create(['role' => 'client', 'is_active' => true]);
        $activeClient = $this->makeClient('Active Client', 'active-options@example.com', 'active', $activeClientUser);
        $invitedClient = $this->makeClient('Invited Client', 'invited-options@example.com', 'invited');
        $this->makeClient('Suspended Client', 'suspended-options@example.com', 'suspended');

        $activeTeamMember = User::factory()->create(['role' => 'custom_admin', 'is_active' => true]);
        $superAdmin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        User::factory()->create(['role' => 'custom_admin', 'is_active' => false]);
        User::factory()->create(['role' => 'client', 'is_active' => true]);

        $response = $this->actingAs($creator)->getJson('/api/projects/assignment-options');

        $response->assertOk()
            ->assertJsonCount(2, 'data.clients')
            ->assertJsonCount(3, 'data.team_members')
            ->assertJsonFragment(['id' => $activeClient->id, 'full_name' => 'Active Client'])
            ->assertJsonFragment(['id' => $invitedClient->id, 'full_name' => 'Invited Client'])
            ->assertJsonFragment(['id' => $creator->id, 'name' => $creator->name])
            ->assertJsonFragment(['id' => $activeTeamMember->id, 'name' => $activeTeamMember->name])
            ->assertJsonFragment(['id' => $superAdmin->id, 'name' => $superAdmin->name]);

        $viewerOnly = User::factory()->withPermissions(['view_projects'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        $this->actingAs($viewerOnly)->getJson('/api/projects/assignment-options')->assertForbidden();
    }

    public function test_project_creation_rejects_suspended_clients_and_non_team_task_assignees(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $clientUser = User::factory()->create(['role' => 'client', 'is_active' => true]);
        $activeClient = $this->makeClient('Active Client', 'active-project@example.com', 'active', $clientUser);
        $suspendedClient = $this->makeClient('Suspended Client', 'suspended-project@example.com', 'suspended');
        $activeTeamMember = User::factory()->create(['role' => 'custom_admin', 'is_active' => true]);
        $suspendedTeamMember = User::factory()->create(['role' => 'custom_admin', 'is_active' => false]);

        $basePayload = [
            'name' => 'New Project',
            'service_category' => 'Media Buying',
            'status' => 'planning',
        ];

        $this->actingAs($admin)->postJson('/api/projects', $basePayload + [
            'client_id' => $suspendedClient->id,
        ])->assertUnprocessable()->assertJsonValidationErrors(['client_id']);

        $this->actingAs($admin)->postJson('/api/projects', $basePayload + [
            'client_id' => $activeClient->id,
            'assigned_team_member_id' => $clientUser->id,
        ])->assertUnprocessable()->assertJsonValidationErrors(['assigned_team_member_id']);

        $this->actingAs($admin)->postJson('/api/projects', $basePayload + [
            'client_id' => $activeClient->id,
            'assigned_team_member_id' => $suspendedTeamMember->id,
        ])->assertUnprocessable()->assertJsonValidationErrors(['assigned_team_member_id']);

        $valid = $this->actingAs($admin)->postJson('/api/projects', $basePayload + [
            'client_id' => $activeClient->id,
            'assigned_team_member_id' => $activeTeamMember->id,
        ])->assertCreated();

        $this->assertSame($activeTeamMember->id, $valid->json('data.assigned_team_member_id'));
        $projectId = $valid->json('data.id');

        $this->actingAs($admin)->postJson("/api/projects/{$projectId}/tasks", [
            'title' => 'Invalid client assignee',
            'assigned_to' => $clientUser->id,
        ])->assertUnprocessable()->assertJsonValidationErrors(['assigned_to']);

        $this->actingAs($admin)->postJson("/api/projects/{$projectId}/tasks", [
            'title' => 'Assigned to active team member',
            'assigned_to' => $activeTeamMember->id,
        ])->assertCreated();
    }

    public function test_client_cannot_use_admin_project_detail_or_admin_approval_endpoints(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $clientUser = User::factory()->create(['role' => 'client', 'is_active' => true]);
        $client = $this->makeClient('Private Data Client', 'private-project@example.com', 'active', $clientUser);
        $project = $this->makeProject($client);

        $approval = ProjectUpdate::create([
            'project_id' => $project->id,
            'author_id' => $admin->id,
            'type' => 'approval_request',
            'title' => 'Review deliverables',
            'body' => 'Please approve the final deliverables.',
            'is_internal' => false,
            'approval_status' => 'pending',
        ]);

        ProjectUpdate::create([
            'project_id' => $project->id,
            'author_id' => $admin->id,
            'type' => 'internal_note',
            'title' => 'Internal only',
            'body' => 'Confidential internal project note.',
            'is_internal' => true,
        ]);

        $this->actingAs($clientUser)
            ->getJson('/api/projects/' . $project->id)
            ->assertForbidden();

        $this->actingAs($clientUser)
            ->postJson('/api/projects/' . $project->id . '/approvals/' . $approval->id . '/respond', [
                'decision' => 'approved',
            ])
            ->assertForbidden();

        $clientView = $this->actingAs($clientUser)->getJson('/api/client/projects/' . $project->id);
        $clientView->assertOk()
            ->assertJsonMissing(['body' => 'Confidential internal project note.'])
            ->assertJsonFragment(['body' => 'Please approve the final deliverables.']);
    }

    public function test_milestone_reordering_requires_the_complete_unique_project_milestone_set(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $client = $this->makeClient('Milestone Client', 'milestones@example.com');
        $otherClient = $this->makeClient('Other Client', 'other-milestones@example.com');
        $project = $this->makeProject($client);
        $otherProject = $this->makeProject($otherClient);

        $one = ProjectMilestone::create(['project_id' => $project->id, 'title' => 'Discovery', 'sort_order' => 1]);
        $two = ProjectMilestone::create(['project_id' => $project->id, 'title' => 'Launch', 'sort_order' => 2]);
        $foreign = ProjectMilestone::create(['project_id' => $otherProject->id, 'title' => 'Foreign milestone', 'sort_order' => 1]);

        $this->actingAs($admin)->putJson('/api/projects/' . $project->id . '/milestones/reorder', [
            'milestone_ids' => [$one->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['milestone_ids']);

        $this->actingAs($admin)->putJson('/api/projects/' . $project->id . '/milestones/reorder', [
            'milestone_ids' => [$one->id, $one->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['milestone_ids.1']);

        $this->actingAs($admin)->putJson('/api/projects/' . $project->id . '/milestones/reorder', [
            'milestone_ids' => [$one->id, $foreign->id],
        ])->assertUnprocessable()->assertJsonValidationErrors(['milestone_ids']);

        $valid = $this->actingAs($admin)->putJson('/api/projects/' . $project->id . '/milestones/reorder', [
            'milestone_ids' => [$two->id, $one->id],
        ])->assertOk();

        $this->assertSame($two->id, $valid->json('data.milestones.0.id'));
        $this->assertSame($one->id, $valid->json('data.milestones.1.id'));
    }

    public function test_completed_projects_are_always_saved_with_one_hundred_percent_progress(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $client = $this->makeClient('Completed Project Client', 'completed-project@example.com');

        $created = $this->actingAs($admin)->postJson('/api/projects', [
            'client_id' => $client->id,
            'name' => 'Completed Campaign',
            'service_category' => 'Marketing',
            'status' => 'completed',
            'progress_percentage' => 30,
        ])->assertCreated();

        $projectId = $created->json('data.id');
        $this->assertSame(100, $created->json('data.progress_percentage'));

        $this->actingAs($admin)->putJson('/api/projects/' . $projectId . '/status', [
            'status' => 'completed',
            'progress_percentage' => 20,
        ])->assertOk()->assertJsonPath('data.progress_percentage', 100);
    }
}
