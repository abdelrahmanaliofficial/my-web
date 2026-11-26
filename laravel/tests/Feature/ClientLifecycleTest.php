<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\ClientInvitation;
use App\Models\Project;
use App\Models\Service;
use App\Models\User;
use App\Notifications\ClientAccountInvitationNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Str;
use Tests\TestCase;

class ClientLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private function createSuperAdmin(): User
    {
        return User::factory()->create([
            'role' => 'super_admin',
            'is_active' => true,
            'suspended_at' => null,
        ]);
    }

    public function test_super_admin_creates_client_profile_and_account_in_transaction_and_sends_invitation(): void
    {
        Notification::fake();

        $admin = $this->createSuperAdmin();
        $service = Service::create(['slug' => 'seo-growth', 'name' => 'SEO Growth', 'is_active' => true]);

        $response = $this->actingAs($admin)->postJson('/api/clients', [
            'full_name' => 'Sara Hassan',
            'email' => 'sara@acme.com',
            'phone' => '+201000000001',
            'company_name' => 'Acme Co',
            'address' => 'Cairo, Egypt',
            'service_ids' => [$service->id],
            'send_invitation' => true,
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.full_name', 'Sara Hassan')
            ->assertJsonPath('data.account_status', 'invited');

        $this->assertDatabaseHas('clients', ['email' => 'sara@acme.com', 'account_status' => 'invited']);
        $this->assertDatabaseHas('users', ['email' => 'sara@acme.com', 'role' => 'client', 'is_active' => false]);
        $this->assertSame('test_sink', $response->json('invitation.delivery_status'));
        $this->assertDatabaseHas('client_invitations', [
            'client_id' => $response->json('data.id'),
            'delivery_status' => 'test_sink',
        ]);

        $clientUser = User::where('email', 'sara@acme.com')->firstOrFail();
        Notification::assertSentTo($clientUser, ClientAccountInvitationNotification::class);
        $this->assertDatabaseHas('client_service', [
            'client_id' => $response->json('data.id'),
            'service_id' => $service->id,
        ]);
        $this->assertArrayNotHasKey('token_hash', $response->json('data.latest_invitation'));
    }

    public function test_duplicate_email_is_rejected_with_validation_error(): void
    {
        $admin = $this->createSuperAdmin();
        User::factory()->create(['email' => 'dup@acme.com', 'role' => 'client']);

        $response = $this->actingAs($admin)->postJson('/api/clients', [
            'full_name' => 'Duplicate User',
            'email' => 'dup@acme.com',
        ]);

        $response->assertStatus(422)->assertJsonValidationErrors(['email']);
    }

    public function test_invitation_acceptance_activates_account_and_revoked_or_expired_link_fails(): void
    {
        $clientUser = User::factory()->create([
            'email' => 'invitee@acme.com',
            'role' => 'client',
            'is_active' => false,
            'email_verified_at' => null,
        ]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Invitee',
            'email' => 'invitee@acme.com',
            'account_status' => 'invited',
        ]);

        $expiredToken = Str::random(64);
        ClientInvitation::create([
            'client_id' => $client->id,
            'user_id' => $clientUser->id,
            'token_hash' => hash('sha256', $expiredToken),
            'expires_at' => now()->subHour(),
        ]);

        $this->postJson('/api/client-invitations/accept', [
            'token' => $expiredToken,
            'password' => 'StrongPass123',
            'password_confirmation' => 'StrongPass123',
        ])->assertStatus(410);

        $validToken = Str::random(64);
        ClientInvitation::create([
            'client_id' => $client->id,
            'user_id' => $clientUser->id,
            'token_hash' => hash('sha256', $validToken),
            'expires_at' => now()->addHours(24),
        ]);

        $this->postJson('/api/client-invitations/verify', ['token' => $validToken])
            ->assertOk()
            ->assertJsonPath('data.email', 'invitee@acme.com')
            ->assertJsonMissingPath('data.token');

        $this->postJson('/api/client-invitations/accept', [
            'token' => $validToken,
            'password' => 'StrongPass123',
            'password_confirmation' => 'StrongPass123',
        ])->assertOk();

        $client->refresh();
        $clientUser->refresh();
        $this->assertSame('active', $client->account_status);
        $this->assertTrue((bool) $clientUser->is_active);
    }

    public function test_super_admin_can_suspend_and_reactivate_client_and_unauthorized_access_is_denied(): void
    {
        $admin = $this->createSuperAdmin();
        $clientUser = User::factory()->create(['email' => 'c1@acme.com', 'role' => 'client', 'is_active' => true]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Client One',
            'email' => 'c1@acme.com',
            'account_status' => 'active',
        ]);

        // Client cannot list or manage clients
        $this->actingAs($clientUser)->getJson('/api/clients')->assertForbidden();
        $this->actingAs($clientUser)->postJson('/api/clients', [
            'full_name' => 'Rogue',
            'email' => 'rogue@acme.com',
        ])->assertForbidden();

        // Client cannot escalate role or status via self-profile endpoint
        $this->actingAs($clientUser)->putJson('/api/client/profile', [
            'full_name' => 'Updated Client One',
            'role' => 'super_admin',
            'account_status' => 'suspended',
        ])->assertStatus(422);

        // Client can retrieve the reduced self-profile, but not administrative client details,
        // activity logs, or the admin project listing endpoint.
        $this->actingAs($clientUser)->getJson('/api/client/profile')->assertOk()->assertJsonMissingPath('data.projects');
        $this->actingAs($clientUser)->getJson("/api/clients/{$client->id}")->assertForbidden();
        $this->actingAs($clientUser)->getJson("/api/clients/{$client->id}/activity")->assertForbidden();
        $this->actingAs($clientUser)->getJson("/api/clients/{$client->id}/projects")->assertForbidden();

        // Client can update allowed personal fields only
        $this->actingAs($clientUser)->putJson('/api/client/profile', [
            'full_name' => 'Updated Client One',
            'phone' => '+201111111111',
            'company_name' => 'Updated Corp',
            'address' => 'Alexandria',
        ])->assertOk()->assertJsonPath('data.full_name', 'Updated Client One');

        // Super admin suspends client
        $this->actingAs($admin)->putJson("/api/clients/{$client->id}/status", [
            'account_status' => 'suspended',
        ])->assertOk()->assertJsonPath('data.account_status', 'suspended');

        $clientUser->refresh();
        $this->assertFalse((bool) $clientUser->is_active);
        $this->assertNotNull($clientUser->suspended_at);

        // Suspended client is blocked from updating profile
        $this->actingAs($clientUser)->putJson('/api/client/profile', [
            'full_name' => 'Blocked Update',
        ])->assertForbidden();
    }

    public function test_invited_client_cannot_be_manually_activated_before_password_setup(): void
    {
        $admin = $this->createSuperAdmin();
        $clientUser = User::factory()->create([
            'email' => 'pending@acme.com',
            'role' => 'client',
            'is_active' => false,
            'email_verified_at' => null,
        ]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Pending Client',
            'email' => 'pending@acme.com',
            'account_status' => 'invited',
        ]);

        $this->actingAs($admin)
            ->putJson("/api/clients/{$client->id}/status", ['account_status' => 'active'])
            ->assertStatus(409)
            ->assertJsonPath('code', 'client_setup_incomplete');

        $this->assertDatabaseHas('clients', ['id' => $client->id, 'account_status' => 'invited']);
        $this->assertDatabaseHas('users', ['id' => $clientUser->id, 'is_active' => false]);
    }

    public function test_email_change_revokes_pending_invitation_and_disables_existing_access_until_reinvited(): void
    {
        $admin = $this->createSuperAdmin();
        $clientUser = User::factory()->create([
            'email' => 'old-address@acme.com',
            'role' => 'client',
            'is_active' => true,
            'email_verified_at' => null,
        ]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Pending Client',
            'email' => 'old-address@acme.com',
            'account_status' => 'invited',
            'invited_at' => now(),
        ]);
        $invitation = ClientInvitation::create([
            'client_id' => $client->id,
            'user_id' => $clientUser->id,
            'token_hash' => hash('sha256', Str::random(64)),
            'expires_at' => now()->addHours(24),
        ]);

        $this->actingAs($admin)->putJson("/api/clients/{$client->id}", [
            'email' => 'new-address@acme.com',
        ])->assertOk()->assertJsonPath('requires_reinvitation', true);

        $client->refresh();
        $clientUser->refresh();
        $invitation->refresh();

        $this->assertSame('new-address@acme.com', $client->email);
        $this->assertSame('new-address@acme.com', $clientUser->email);
        $this->assertSame('invited', $client->account_status);
        $this->assertNull($client->invited_at);
        $this->assertNull($clientUser->email_verified_at);
        $this->assertFalse((bool) $clientUser->is_active);
        $this->assertNotNull($invitation->revoked_at);
    }

    public function test_invitation_is_single_use_and_invalidates_other_pending_tokens(): void
    {
        $clientUser = User::factory()->create([
            'email' => 'one-time@acme.com',
            'role' => 'client',
            'is_active' => false,
            'email_verified_at' => null,
        ]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'One Time Invitee',
            'email' => 'one-time@acme.com',
            'account_status' => 'invited',
        ]);

        $tokenOne = Str::random(64);
        $tokenTwo = Str::random(64);
        $first = ClientInvitation::create([
            'client_id' => $client->id,
            'user_id' => $clientUser->id,
            'token_hash' => hash('sha256', $tokenOne),
            'expires_at' => now()->addHours(24),
        ]);
        $second = ClientInvitation::create([
            'client_id' => $client->id,
            'user_id' => $clientUser->id,
            'token_hash' => hash('sha256', $tokenTwo),
            'expires_at' => now()->addHours(24),
        ]);

        $this->postJson('/api/client-invitations/accept', [
            'token' => $tokenOne,
            'password' => 'StrongPass123',
            'password_confirmation' => 'StrongPass123',
        ])->assertOk();

        $first->refresh();
        $second->refresh();
        $this->assertNotNull($first->accepted_at);
        $this->assertNotNull($second->revoked_at);

        $this->postJson('/api/client-invitations/accept', [
            'token' => $tokenOne,
            'password' => 'AnotherStrongPass456',
            'password_confirmation' => 'AnotherStrongPass456',
        ])->assertStatus(410);
    }

    public function test_custom_admin_with_client_permissions_can_manage_client_profiles_but_client_cannot_list_them(): void
    {
        $admin = User::factory()->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        $admin->syncPermissions(['view_clients', 'create_clients', 'update_clients']);

        $this->actingAs($admin)->postJson('/api/clients', [
            'full_name' => 'Delegated Client',
            'email' => 'delegated@acme.com',
            'send_invitation' => false,
        ])->assertCreated();

        $clientUser = User::where('email', 'delegated@acme.com')->firstOrFail();
        $this->actingAs($clientUser)->getJson('/api/clients')->assertForbidden();
    }


    public function test_custom_admin_with_update_clients_cannot_change_login_email_without_manage_clients(): void
    {
        $admin = User::factory()->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        $admin->syncPermissions(['view_clients', 'update_clients']);

        $clientUser = User::factory()->create([
            'email' => 'email-change@acme.com',
            'role' => 'client',
            'is_active' => true,
            'email_verified_at' => now(),
        ]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Email Change Client',
            'email' => 'email-change@acme.com',
            'account_status' => 'active',
        ]);

        $this->actingAs($admin)->putJson("/api/clients/{$client->id}", [
            'email' => 'new-address@acme.com',
        ])->assertForbidden();

        $this->assertDatabaseHas('clients', [
            'id' => $client->id,
            'email' => 'email-change@acme.com',
        ]);
        $this->assertDatabaseHas('users', [
            'id' => $clientUser->id,
            'email' => 'email-change@acme.com',
            'is_active' => true,
        ]);
    }

    public function test_permanent_client_deletion_is_blocked_to_preserve_business_and_audit_history(): void
    {
        $admin = $this->createSuperAdmin();
        $clientUser = User::factory()->create(['email' => 'retained@acme.com', 'role' => 'client']);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Retained Client',
            'email' => 'retained@acme.com',
            'account_status' => 'active',
        ]);

        $this->actingAs($admin)->deleteJson("/api/clients/{$client->id}")
            ->assertStatus(409)
            ->assertJsonPath('code', 'client_history_retention');

        $this->assertDatabaseHas('clients', ['id' => $client->id]);
        $this->assertDatabaseHas('users', ['id' => $clientUser->id]);
    }



    public function test_client_manager_without_project_permission_cannot_read_project_records_from_client_details(): void
    {
        $admin = User::factory()->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        $admin->syncPermissions(['view_clients']);

        $clientUser = User::factory()->create([
            'email' => 'project-owner@acme.com',
            'role' => 'client',
            'is_active' => true,
        ]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Project Owner',
            'email' => 'project-owner@acme.com',
            'account_status' => 'active',
        ]);
        Project::create([
            'client_id' => $client->id,
            'name' => 'Confidential Project',
            'title' => 'Confidential Project',
            'status' => 'planning',
        ]);

        $this->actingAs($admin)
            ->getJson("/api/clients/{$client->id}")
            ->assertOk()
            ->assertJsonMissingPath('data.projects');

        $this->actingAs($admin)
            ->getJson("/api/clients/{$client->id}/projects")
            ->assertForbidden();

        // Client self-profile is deliberately reduced; project details use the dedicated client portal API.
        $this->actingAs($clientUser)
            ->getJson('/api/client/profile')
            ->assertOk()
            ->assertJsonMissingPath('data.projects');
    }

    public function test_invitation_is_not_reported_as_emailed_when_mailer_is_log(): void
    {
        Notification::fake();
        config(['mail.default' => 'log']);
        $admin = $this->createSuperAdmin();

        $response = $this->actingAs($admin)->postJson('/api/clients', [
            'full_name' => 'Mail Not Configured',
            'email' => 'mail-not-configured@acme.com',
            'send_invitation' => true,
        ])->assertCreated();

        $this->assertSame('not_configured', $response->json('invitation.delivery_status'));
        $this->assertStringContainsString('not emailed', strtolower($response->json('invitation.delivery_message')));
        Notification::assertNothingSent();
    }

    public function test_revoke_access_disables_client_and_invalidates_pending_invitations_and_api_tokens(): void
    {
        $admin = $this->createSuperAdmin();
        $clientUser = User::factory()->create([
            'email' => 'revoke@acme.com',
            'role' => 'client',
            'is_active' => true,
        ]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Revoke Client',
            'email' => 'revoke@acme.com',
            'account_status' => 'active',
        ]);
        $clientUser->createToken('client-test');
        $invitation = ClientInvitation::create([
            'client_id' => $client->id,
            'user_id' => $clientUser->id,
            'token_hash' => hash('sha256', Str::random(64)),
            'expires_at' => now()->addHours(24),
        ]);

        $oldAuthVersion = (int) $clientUser->auth_version;
        $this->actingAs($admin)
            ->postJson("/api/clients/{$client->id}/revoke-access")
            ->assertOk()
            ->assertJsonPath('data.account_status', 'suspended');

        $clientUser->refresh();
        $invitation->refresh();
        $this->assertFalse((bool) $clientUser->is_active);
        $this->assertGreaterThan($oldAuthVersion, (int) $clientUser->auth_version);
        $this->assertNotNull($invitation->revoked_at);
        $this->assertDatabaseMissing('personal_access_tokens', ['tokenable_id' => $clientUser->id]);
    }

    public function test_invitation_can_create_and_link_an_account_for_a_legacy_client_profile(): void
    {
        Notification::fake();
        $admin = $this->createSuperAdmin();
        $client = Client::create([
            'user_id' => null,
            'full_name' => 'Legacy Client',
            'email' => 'legacy@acme.com',
            'account_status' => 'invited',
        ]);

        $response = $this->actingAs($admin)
            ->postJson("/api/clients/{$client->id}/invite")
            ->assertOk()
            ->assertJsonPath('success', true);

        $client->refresh();
        $this->assertNotNull($client->user_id);
        $this->assertDatabaseHas('users', [
            'id' => $client->user_id,
            'email' => 'legacy@acme.com',
            'role' => 'client',
            'is_active' => false,
        ]);
        $this->assertSame('test_sink', $response->json('invitation.delivery_status'));
        Notification::assertSentTo(User::findOrFail($client->user_id), ClientAccountInvitationNotification::class);
    }

    public function test_custom_admin_with_create_permission_cannot_send_invitation_without_client_management_permission(): void
    {
        Notification::fake();
        $admin = User::factory()->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        $admin->syncPermissions(['view_clients', 'create_clients']);

        $this->actingAs($admin)->postJson('/api/clients', [
            'full_name' => 'Restricted Invitation',
            'email' => 'restricted-invite@acme.com',
            'send_invitation' => true,
        ])->assertForbidden();

        $this->assertDatabaseMissing('clients', ['email' => 'restricted-invite@acme.com']);
        $this->assertDatabaseMissing('users', ['email' => 'restricted-invite@acme.com']);
        Notification::assertNothingSent();

        // The same delegated administrator may create the profile/account without
        // issuing an invitation; invitation delivery remains a manage_clients action.
        $response = $this->postJson('/api/clients', [
            'full_name' => 'Profile Only Client',
            'email' => 'profile-only@acme.com',
            'send_invitation' => false,
        ])->assertCreated();

        $this->assertDatabaseHas('clients', [
            'id' => $response->json('data.id'),
            'email' => 'profile-only@acme.com',
            'account_status' => 'invited',
        ]);
        $this->assertDatabaseHas('users', [
            'email' => 'profile-only@acme.com',
            'role' => 'client',
            'is_active' => false,
        ]);
        $this->assertDatabaseMissing('client_invitations', [
            'client_id' => $response->json('data.id'),
        ]);
    }

    public function test_reactivation_revokes_sessions_when_client_and_user_status_were_inconsistent(): void
    {
        $admin = $this->createSuperAdmin();
        $clientUser = User::factory()->create([
            'email' => 'inconsistent@acme.com',
            'role' => 'client',
            'is_active' => true,
            'email_verified_at' => now(),
            'suspended_at' => null,
        ]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Inconsistent State Client',
            'email' => 'inconsistent@acme.com',
            'account_status' => 'suspended',
        ]);
        $clientUser->createToken('stale-client-token');
        $oldAuthVersion = (int) $clientUser->auth_version;

        $this->actingAs($admin)
            ->putJson("/api/clients/{$client->id}/status", ['account_status' => 'active'])
            ->assertOk()
            ->assertJsonPath('data.account_status', 'active');

        $clientUser->refresh();
        $this->assertGreaterThan($oldAuthVersion, (int) $clientUser->auth_version);
        $this->assertDatabaseMissing('personal_access_tokens', [
            'tokenable_id' => $clientUser->id,
            'name' => 'stale-client-token',
        ]);
    }

}
