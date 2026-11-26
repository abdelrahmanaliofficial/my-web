<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProjectTrackingTest extends TestCase
{
    use RefreshDatabase;

    public function test_project_ownership_isolation_between_two_separate_clients_and_no_trusted_client_id(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);

        $clientUserA = User::factory()->create(['email' => 'clientA@example.com', 'role' => 'client', 'is_active' => true]);
        $clientA = Client::create([
            'user_id' => $clientUserA->id,
            'full_name' => 'Client A',
            'email' => 'clientA@example.com',
            'account_status' => 'active',
        ]);

        $clientUserB = User::factory()->create(['email' => 'clientB@example.com', 'role' => 'client', 'is_active' => true]);
        $clientB = Client::create([
            'user_id' => $clientUserB->id,
            'full_name' => 'Client B',
            'email' => 'clientB@example.com',
            'account_status' => 'active',
        ]);

        $projectA = Project::create([
            'client_id' => $clientA->id,
            'name' => 'Alpha Funnel Rebuild',
            'service_category' => 'Web Engineering',
            'status' => 'in_progress',
            'priority' => 'high',
            'progress_percentage' => 45,
        ]);

        $projectB = Project::create([
            'client_id' => $clientB->id,
            'name' => 'Beta SEO Sprint',
            'service_category' => 'SEO Growth',
            'status' => 'planning',
            'priority' => 'medium',
            'progress_percentage' => 15,
        ]);

        // Even if Client A passes ?client_id=clientB->id, backend derives Client A from auth()->user()
        $listA = $this->actingAs($clientUserA)->getJson("/api/client/projects?client_id={$clientB->id}");
        $listA->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $projectA->id);

        // Client A cannot view Client B's project directly -> 403
        $this->actingAs($clientUserA)->getJson("/api/client/projects/{$projectB->id}")->assertForbidden();

        // Client B cannot access admin endpoints -> 403
        $this->actingAs($clientUserB)->getJson('/api/projects')->assertForbidden();
        $this->actingAs($clientUserB)->postJson('/api/projects', [
            'client_id' => $clientA->id,
            'name' => 'Unauthorized',
            'service_category' => 'SEO',
        ])->assertForbidden();

        // Admin can see both projects
        $this->actingAs($admin)->getJson('/api/projects')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_private_internal_notes_and_hidden_tasks_are_never_exposed_to_clients(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $clientUser = User::factory()->create(['email' => 'c1@example.com', 'role' => 'client', 'is_active' => true]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Client One',
            'email' => 'c1@example.com',
            'account_status' => 'active',
        ]);

        $project = Project::create([
            'client_id' => $client->id,
            'name' => 'Portal Launch',
            'service_category' => 'Full Stack',
            'status' => 'in_progress',
            'progress_percentage' => 60,
        ]);

        // Admin posts public progress update + private internal note + visible/hidden tasks
        $this->actingAs($admin)->postJson("/api/projects/{$project->id}/updates", [
            'title' => 'Sprint 1 Completed',
            'body' => 'Staging environment is ready for your review.',
            'is_internal' => false,
        ])->assertCreated();

        $this->actingAs($admin)->postJson("/api/projects/{$project->id}/updates", [
            'title' => 'Internal Margin Note',
            'body' => 'Confidential internal billing discussion - never show client.',
            'is_internal' => true,
        ])->assertCreated();

        $this->actingAs($admin)->postJson("/api/projects/{$project->id}/tasks", [
            'title' => 'Review staging copy',
            'is_client_visible' => true,
        ])->assertCreated();

        $this->actingAs($admin)->postJson("/api/projects/{$project->id}/tasks", [
            'title' => 'Internal QA checklist',
            'is_client_visible' => false,
        ])->assertCreated();

        $clientResponse = $this->actingAs($clientUser)->getJson("/api/client/projects/{$project->id}");
        $clientResponse->assertOk()
            ->assertJsonCount(1, 'data.updates')
            ->assertJsonCount(1, 'data.tasks')
            ->assertJsonMissing(['body' => 'Confidential internal billing discussion - never show client.'])
            ->assertJsonMissing(['title' => 'Internal QA checklist']);
    }

    public function test_progress_validation_milestone_reordering_and_client_approval_workflow(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $clientUser = User::factory()->create(['email' => 'c2@example.com', 'role' => 'client', 'is_active' => true]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Client Two',
            'email' => 'c2@example.com',
            'account_status' => 'active',
        ]);

        $createRes = $this->actingAs($admin)->postJson('/api/projects', [
            'client_id' => $client->id,
            'name' => 'Campaign Architecture',
            'service_category' => 'Performance Ads',
            'progress_percentage' => 150,
        ]);
        $createRes->assertStatus(422)->assertJsonValidationErrors(['progress_percentage']);

        $validRes = $this->actingAs($admin)->postJson('/api/projects', [
            'client_id' => $client->id,
            'name' => 'Campaign Architecture',
            'service_category' => 'Performance Ads',
            'progress_percentage' => 25,
            'status' => 'planning',
        ]);
        $validRes->assertCreated();
        $projectId = $validRes->json('data.id');

        // Create and reorder milestones
        $m1Res = $this->actingAs($admin)->postJson("/api/projects/{$projectId}/milestones", ['title' => 'Discovery'])->assertCreated();
        $m1Id = $m1Res->json('data.milestones.0.id');
        $m2Res = $this->actingAs($admin)->postJson("/api/projects/{$projectId}/milestones", ['title' => 'Launch'])->assertCreated();
        $m2Id = $m2Res->json('data.milestones.1.id');

        $reorderRes = $this->actingAs($admin)->putJson("/api/projects/{$projectId}/milestones/reorder", [
            'milestone_ids' => [$m2Id, $m1Id],
        ])->assertOk();
        $this->assertSame($m2Id, $reorderRes->json('data.milestones.0.id'));

        // Request approval and record client approval
        $approvalReq = $this->actingAs($admin)->postJson("/api/projects/{$projectId}/updates", [
            'title' => 'Approve Ad Creatives',
            'body' => 'Please review and approve batch #1 creatives.',
            'request_approval' => true,
        ])->assertCreated();
        $this->assertSame('waiting_for_client', $approvalReq->json('data.status'));
        $updateId = $approvalReq->json('data.updates.0.id');

        $clientApproval = $this->actingAs($clientUser)->postJson("/api/client/projects/{$projectId}/approvals/{$updateId}/respond", [
            'decision' => 'approved',
            'comment' => 'Approved to launch.',
        ])->assertOk();
        $this->assertSame('in_progress', $clientApproval->json('data.status'));

        // An approval request is single-use; a second response must not overwrite the first.
        $this->actingAs($clientUser)->postJson("/api/client/projects/{$projectId}/approvals/{$updateId}/respond", [
            'decision' => 'changes_requested',
            'comment' => 'This second response must be rejected.',
        ])->assertStatus(409);
    }
}
