<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Conversation;
use App\Models\MediaFile;
use App\Models\Message;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MessagingSystemTest extends TestCase
{
    use RefreshDatabase;

    private function createClient(string $name, string $email): array
    {
        $user = User::factory()->create([
            'name' => $name,
            'email' => $email,
            'role' => 'client',
            'is_active' => true,
            'suspended_at' => null,
        ]);

        $client = Client::create([
            'user_id' => $user->id,
            'full_name' => $name,
            'email' => $email,
            'account_status' => 'active',
        ]);

        return [$user, $client];
    }

    private function createConversation(Client $client, User $admin, ?Project $project = null): Conversation
    {
        return Conversation::create([
            'client_id' => $client->id,
            'project_id' => $project?->id,
            'created_by' => $admin->id,
            'subject' => 'Project discussion',
            'status' => 'open',
        ]);
    }

    public function test_clients_are_isolated_and_cannot_use_administrative_message_endpoints(): void
    {
        $admin = User::factory()->withPermissions(['manage_messages'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        [$clientUserA, $clientA] = $this->createClient('Client A', 'client-a@example.test');
        [$clientUserB, $clientB] = $this->createClient('Client B', 'client-b@example.test');
        $conversationA = $this->createConversation($clientA, $admin);
        $conversationB = $this->createConversation($clientB, $admin);

        $this->actingAs($clientUserA)
            ->getJson('/api/client/conversations')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $conversationA->id);

        $this->actingAs($clientUserB)
            ->getJson('/api/client/conversations?client_id=' . $clientA->id)
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $conversationB->id);

        // A client cannot use another client's ID to read, reply to, or mark read.
        $this->actingAs($clientUserA)->getJson("/api/client/conversations/{$conversationB->id}")->assertForbidden();
        $this->actingAs($clientUserA)->postJson("/api/client/conversations/{$conversationB->id}/messages", [
            'body' => 'Cross-client attempt',
        ])->assertForbidden();
        $this->actingAs($clientUserA)->postJson("/api/client/conversations/{$conversationB->id}/read")->assertForbidden();

        // Client-owned threads are deliberately unavailable through admin endpoints.
        $this->actingAs($clientUserA)->getJson("/api/conversations/{$conversationA->id}")->assertForbidden();
        $this->actingAs($clientUserA)->postJson("/api/conversations/{$conversationA->id}/messages", [
            'body' => 'Attempt via admin route',
        ])->assertForbidden();
        $this->actingAs($clientUserA)->postJson("/api/conversations/{$conversationA->id}/read")->assertForbidden();

        $this->actingAs($admin)->getJson('/api/conversations')->assertOk()->assertJsonCount(2, 'data');
    }

    public function test_admin_can_start_thread_and_client_can_reply_and_read_messages(): void
    {
        // This admin has message-module grants only; no client/project view grant is needed.
        $admin = User::factory()->withPermissions(['view_messages', 'create_messages'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        [$clientUser, $client] = $this->createClient('Client A', 'client-a@example.test');
        $project = Project::create([
            'client_id' => $client->id,
            'title' => 'Website delivery',
            'name' => 'Website delivery',
            'service_category' => 'website',
            'status' => 'planning',
        ]);

        $this->actingAs($admin)
            ->getJson('/api/conversation-options')
            ->assertOk()
            ->assertJsonCount(1, 'data.clients')
            ->assertJsonPath('data.clients.0.id', $client->id)
            ->assertJsonCount(1, 'data.projects')
            ->assertJsonPath('data.projects.0.id', $project->id);

        $create = $this->actingAs($admin)->postJson('/api/conversations', [
            'client_id' => $client->id,
            'project_id' => $project->id,
            'subject' => 'Website launch',
            'initial_message' => 'The first delivery is ready for review.',
        ])->assertCreated();

        $conversationId = (int) $create->json('data.id');
        $this->assertDatabaseHas('conversations', [
            'id' => $conversationId,
            'client_id' => $client->id,
            'project_id' => $project->id,
            'status' => 'open',
        ]);
        $this->assertDatabaseHas('messages', [
            'conversation_id' => $conversationId,
            'sender_id' => $admin->id,
            'sender_type' => 'admin',
            'body' => 'The first delivery is ready for review.',
        ]);

        $clientThread = $this->actingAs($clientUser)
            ->getJson("/api/client/conversations/{$conversationId}")
            ->assertOk()
            ->assertJsonPath('data.conversation.id', $conversationId)
            ->assertJsonPath('data.messages.0.sender_type', 'admin');
        $clientThread->assertJsonMissingPath('data.messages.0.sender_id');
        $clientThread->assertJsonMissingPath('data.messages.0.read_by');

        $this->actingAs($clientUser)->postJson("/api/client/conversations/{$conversationId}/messages", [
            'body' => 'I reviewed it. Please send the final files.',
        ])->assertCreated()
            ->assertJsonPath('data.sender_type', 'client');

        $this->assertDatabaseHas('messages', [
            'conversation_id' => $conversationId,
            'sender_id' => $clientUser->id,
            'sender_type' => 'client',
            'body' => 'I reviewed it. Please send the final files.',
        ]);

        // The client has read the initial admin message; the admin then reads the reply.
        $this->actingAs($clientUser)
            ->postJson("/api/client/conversations/{$conversationId}/read")
            ->assertOk();
        $this->assertNotNull(Message::where('conversation_id', $conversationId)
            ->where('sender_type', 'admin')->firstOrFail()->fresh()->read_at);

        $this->actingAs($admin)
            ->postJson("/api/conversations/{$conversationId}/read")
            ->assertOk()
            ->assertJsonPath('data.unread_count', 0);
        $this->assertNotNull(Message::where('conversation_id', $conversationId)
            ->where('sender_type', 'client')->firstOrFail()->fresh()->read_at);
    }

    public function test_message_history_is_paginated_chronologically_and_archive_is_admin_controlled(): void
    {
        $admin = User::factory()->withPermissions(['manage_messages'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        [$clientUser, $client] = $this->createClient('Client A', 'client-a@example.test');
        $conversation = $this->createConversation($client, $admin);

        for ($index = 1; $index <= 12; $index++) {
            Message::create([
                'conversation_id' => $conversation->id,
                'sender_id' => $index % 2 === 0 ? $clientUser->id : $admin->id,
                'sender_type' => $index % 2 === 0 ? 'client' : 'admin',
                'body' => "Message {$index}",
            ]);
        }

        $pageOne = $this->actingAs($admin)
            ->getJson("/api/conversations/{$conversation->id}?per_page=5&page=1")
            ->assertOk()
            ->assertJsonPath('data.pagination.current_page', 1)
            ->assertJsonPath('data.pagination.has_more', true);
        $this->assertSame(
            ['Message 8', 'Message 9', 'Message 10', 'Message 11', 'Message 12'],
            array_column($pageOne->json('data.messages'), 'body')
        );

        $pageTwo = $this->actingAs($admin)
            ->getJson("/api/conversations/{$conversation->id}?per_page=5&page=2")
            ->assertOk()
            ->assertJsonPath('data.pagination.current_page', 2);
        $this->assertSame(
            ['Message 3', 'Message 4', 'Message 5', 'Message 6', 'Message 7'],
            array_column($pageTwo->json('data.messages'), 'body')
        );

        $clientPageOne = $this->actingAs($clientUser)
            ->getJson("/api/client/conversations/{$conversation->id}?per_page=5&page=1")
            ->assertOk()
            ->assertJsonPath('data.pagination.current_page', 1);
        $this->assertSame(
            ['Message 8', 'Message 9', 'Message 10', 'Message 11', 'Message 12'],
            array_column($clientPageOne->json('data.messages'), 'body')
        );

        // Clients may reply to open threads but cannot archive or reopen them.
        $this->actingAs($clientUser)
            ->postJson("/api/conversations/{$conversation->id}/archive")
            ->assertForbidden();

        $this->actingAs($admin)
            ->postJson("/api/conversations/{$conversation->id}/archive")
            ->assertOk()
            ->assertJsonPath('data.status', 'archived');

        $this->actingAs($clientUser)
            ->postJson("/api/client/conversations/{$conversation->id}/messages", ['body' => 'Reply to archived'])
            ->assertStatus(422);

        $this->actingAs($admin)
            ->postJson("/api/conversations/{$conversation->id}/reopen")
            ->assertOk()
            ->assertJsonPath('data.status', 'open');
    }

    public function test_private_message_attachments_use_shared_storage_and_remain_client_scoped(): void
    {
        config(['filesystems.private_media_disk' => 'local']);
        Storage::fake('local');

        $admin = User::factory()->withPermissions(['manage_messages'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        [$clientUserA, $clientA] = $this->createClient('Client A', 'client-a@example.test');
        [$clientUserB, $clientB] = $this->createClient('Client B', 'client-b@example.test');
        $conversation = $this->createConversation($clientA, $admin);

        $attachment = UploadedFile::fake()->createWithContent(
            'requirements.pdf',
            "%PDF-1.4\nPrivate client requirements\n%%EOF"
        );

        $response = $this->actingAs($clientUserA)->post(
            "/api/client/conversations/{$conversation->id}/messages",
            [
                'body' => 'Please review the attached requirements.',
                'attachments' => [$attachment],
            ]
        );
        $response->assertCreated();

        $messageId = (int) $response->json('data.id');
        $this->assertDatabaseHas('message_attachments', ['message_id' => $messageId]);
        $media = MediaFile::query()->where('category', 'message_attachment')->firstOrFail();
        $this->assertSame('private', $media->visibility);
        $this->assertSame($clientA->id, $media->client_id);
        Storage::disk('local')->assertExists($media->storage_path);

        $this->actingAs($clientUserA)->get("/api/media/{$media->file_uid}/download")->assertOk();
        $this->actingAs($clientUserB)->get("/api/media/{$media->file_uid}/download")->assertForbidden();

        $history = $this->actingAs($clientUserA)
            ->getJson("/api/client/conversations/{$conversation->id}")
            ->assertOk();
        $this->assertSame($media->file_uid, $history->json('data.messages.0.attachments.0.file_uid'));
        $history->assertJsonMissingPath('data.messages.0.attachments.0.storage_path');
        $history->assertJsonMissingPath('data.messages.0.attachments.0.owner_id');

        $this->actingAs($clientUserB)
            ->getJson("/api/client/conversations/{$conversation->id}")
            ->assertForbidden();
    }

    public function test_view_only_admin_can_read_but_cannot_create_send_or_archive(): void
    {
        $viewer = User::factory()->withPermissions(['view_messages'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        $manager = User::factory()->withPermissions(['manage_messages'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        [, $client] = $this->createClient('Client A', 'client-a@example.test');
        $conversation = $this->createConversation($client, $manager);

        $this->actingAs($viewer)->getJson('/api/conversations')->assertOk();
        $this->actingAs($viewer)->getJson("/api/conversations/{$conversation->id}")->assertOk();
        $this->actingAs($viewer)->getJson('/api/conversation-options')->assertForbidden();
        $this->actingAs($viewer)->postJson("/api/conversations/{$conversation->id}/messages", [
            'body' => 'Not permitted',
        ])->assertForbidden();
        $this->actingAs($viewer)->postJson("/api/conversations/{$conversation->id}/archive")->assertForbidden();
    }
}
