<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Conversation;
use App\Models\Message;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MessagingTest extends TestCase
{
    use RefreshDatabase;

    private function seedClientsAndUsers(): array
    {
        $admin = User::factory()->create([
            'role' => 'super_admin',
            'is_active' => true,
        ]);

        $userA = User::factory()->create([
            'role' => 'client',
            'is_active' => true,
        ]);
        $clientA = Client::create([
            'user_id' => $userA->id,
            'full_name' => 'Alpha Client',
            'email' => $userA->email,
            'account_status' => 'active',
        ]);

        $userB = User::factory()->create([
            'role' => 'client',
            'is_active' => true,
        ]);
        $clientB = Client::create([
            'user_id' => $userB->id,
            'full_name' => 'Beta Client',
            'email' => $userB->email,
            'account_status' => 'active',
        ]);

        $projectA = Project::create([
            'client_id' => $clientA->id,
            'name' => 'Alpha Web Build',
            'status' => 'in_progress',
        ]);

        return compact('admin', 'userA', 'clientA', 'userB', 'clientB', 'projectA');
    }

    public function test_admin_can_start_conversation_send_attachments_paginate_and_enforce_two_client_isolation(): void
    {
        Storage::fake('local');
        ['admin' => $admin, 'userA' => $userA, 'clientA' => $clientA, 'userB' => $userB, 'projectA' => $projectA] = $this->seedClientsAndUsers();

        // 1. Admin starts conversation with initial message + private PDF attachment
        $file = UploadedFile::fake()->create('scope.pdf', 64, 'application/pdf');
        $createRes = $this->actingAs($admin)->post('/api/conversations', [
            'client_id' => $clientA->id,
            'project_id' => $projectA->id,
            'subject' => 'Launch Readiness',
            'initial_message' => 'Please review the attached scope document.',
            'attachment' => $file,
        ]);

        $createRes->assertStatus(201);
        $convId = $createRes->json('data.id');
        $attachmentUid = $createRes->json('data.latest_message.attachments.0.file_uid');
        $this->assertNotEmpty($attachmentUid);

        // 2. Client B cannot access Client A's conversation, reply, mark read, or attachment
        $this->actingAs($userB)->getJson("/api/client/conversations/{$convId}")->assertStatus(403);
        $this->actingAs($userB)->postJson("/api/client/conversations/{$convId}/messages", [
            'body' => 'Unauthorized snooping',
        ])->assertStatus(403);
        $this->actingAs($userB)->postJson("/api/client/conversations/{$convId}/read")->assertStatus(403);
        $this->actingAs($userB)->get("/api/media/{$attachmentUid}/download")->assertStatus(403);

        // 3. Client A sees unread count = 1, views thread, downloads attachment, and marks read
        $listA = $this->actingAs($userA)->getJson('/api/client/conversations');
        $listA->assertOk()->assertJsonPath('meta.total_unread_count', 1);

        $this->actingAs($userA)->get("/api/media/{$attachmentUid}/download")->assertOk();
        $this->actingAs($userA)->postJson("/api/client/conversations/{$convId}/read")
            ->assertOk()
            ->assertJsonPath('data.updated_count', 1);

        // 4. Client A replies with text and another attachment -> admin sees unread_count = 1
        $replyFile = UploadedFile::fake()->image('feedback.png', 100, 100);
        $replyRes = $this->actingAs($userA)->post("/api/client/conversations/{$convId}/messages", [
            'body' => 'Reviewed and approved! Attaching annotated screenshot.',
            'attachment' => $replyFile,
        ]);
        $replyRes->assertStatus(201);

        $adminSummary = $this->actingAs($admin)->getJson('/api/conversations/unread-summary');
        $adminSummary->assertOk()->assertJsonPath('data.total_unread_count', 1);

        // 5. Pagination: create extra messages and verify page 1 & page 2
        for ($i = 1; $i <= 7; $i++) {
            Message::create([
                'conversation_id' => $convId,
                'sender_id' => $admin->id,
                'sender_type' => 'admin',
                'body' => "Followup #{$i}",
            ]);
        }

        $page1 = $this->actingAs($admin)->getJson("/api/conversations/{$convId}?per_page=5&page=1");
        $page1->assertOk()
            ->assertJsonCount(5, 'data.messages')
            ->assertJsonPath('data.pagination.has_more', true);

        $page2 = $this->actingAs($admin)->getJson("/api/conversations/{$convId}?per_page=5&page=2");
        $page2->assertOk()
            ->assertJsonCount(4, 'data.messages')
            ->assertJsonPath('data.pagination.has_more', false);

        // 6. Client cannot archive or touch admin routes
        $this->actingAs($userA)->postJson("/api/conversations/{$convId}/archive")->assertStatus(403);

        // 7. Admin archives conversation -> further sends rejected
        $this->actingAs($admin)->postJson("/api/conversations/{$convId}/archive")
            ->assertOk()
            ->assertJsonPath('data.status', 'archived');

        $this->actingAs($userA)->postJson("/api/client/conversations/{$convId}/messages", [
            'body' => 'Trying after archive',
        ])->assertStatus(422);
    }

    public function test_custom_admin_without_messaging_permissions_is_denied(): void
    {
        ['admin' => $admin, 'clientA' => $clientA] = $this->seedClientsAndUsers();
        $conversation = Conversation::create([
            'client_id' => $clientA->id,
            'created_by' => $admin->id,
            'subject' => 'Restricted Thread',
            'status' => 'open',
        ]);

        $noMsgAdmin = User::factory()->withPermissions(['view_leads'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);

        $this->actingAs($noMsgAdmin)->getJson('/api/conversations')->assertStatus(403);
        $this->actingAs($noMsgAdmin)->postJson('/api/conversations', [
            'client_id' => $clientA->id,
            'initial_message' => 'Denied',
        ])->assertStatus(403);

        $viewOnlyAdmin = User::factory()->withPermissions(['view_messages'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);

        $this->actingAs($viewOnlyAdmin)->getJson('/api/conversations')->assertOk();
        $this->actingAs($viewOnlyAdmin)->postJson("/api/conversations/{$conversation->id}/messages", [
            'body' => 'Should be forbidden for view-only admin',
        ])->assertStatus(403);
        $this->actingAs($viewOnlyAdmin)->postJson("/api/conversations/{$conversation->id}/archive")
            ->assertStatus(403);
    }
}
