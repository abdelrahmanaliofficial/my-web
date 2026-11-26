<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthorizationBoundaryTest extends TestCase
{
    use RefreshDatabase;

    public function test_custom_admin_without_explicit_permissions_cannot_access_administrative_resources(): void
    {
        $customAdmin = User::factory()->create([
            'role' => 'custom_admin',
            'is_active' => true,
            'suspended_at' => null,
        ]);

        $this->actingAs($customAdmin)->getJson('/api/clients')->assertForbidden();
        $this->actingAs($customAdmin)->getJson('/api/projects')->assertForbidden();
        $this->actingAs($customAdmin)->getJson('/api/invoices')->assertForbidden();
        $this->actingAs($customAdmin)->getJson('/api/conversations')->assertForbidden();
        $this->actingAs($customAdmin)->getJson('/api/media')->assertForbidden();
    }

    public function test_only_super_admin_can_list_or_manage_team_members(): void
    {
        $customAdmin = User::factory()->withPermissions(['view_leads'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
            'suspended_at' => null,
        ]);

        $client = User::factory()->create([
            'role' => 'client',
            'is_active' => true,
            'suspended_at' => null,
        ]);

        $superAdmin = User::factory()->create([
            'role' => 'super_admin',
            'is_active' => true,
            'suspended_at' => null,
        ]);

        $this->actingAs($customAdmin)->getJson('/api/team')->assertForbidden();
        $this->actingAs($customAdmin)->getJson('/api/team/activity')->assertForbidden();

        $this->actingAs($superAdmin)
            ->putJson("/api/team/{$client->id}/permissions", ['permissions' => ['view_leads']])
            ->assertNotFound();

        $this->actingAs($superAdmin)
            ->putJson("/api/team/{$client->id}/status", ['is_active' => false])
            ->assertNotFound();

        $this->actingAs($superAdmin)
            ->postJson("/api/team/{$client->id}/revoke-sessions")
            ->assertNotFound();
    }
}
