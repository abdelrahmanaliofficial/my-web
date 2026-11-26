<?php

namespace Tests\Feature;

use App\Authorization\PermissionCatalog;
use App\Models\Permission;
use App\Models\MediaFile;
use App\Models\Project;
use App\Models\Client;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Gate;
use Tests\TestCase;

class RolePermissionTest extends TestCase
{
    use RefreshDatabase;

    public function test_normalized_roles_and_permissions_are_seeded_by_migration(): void
    {
        $this->assertDatabaseHas('roles', ['slug' => 'super_admin']);
        $this->assertDatabaseHas('roles', ['slug' => 'custom_admin']);
        $this->assertDatabaseHas('roles', ['slug' => 'client']);
        $this->assertDatabaseHas('permissions', ['slug' => 'view_leads']);
        $this->assertDatabaseHas('permissions', ['slug' => 'manage_projects']);

        $this->assertSame(3, Role::query()->count());
        $this->assertSame(count(PermissionCatalog::slugs()), Permission::query()->count());
    }

    public function test_every_module_supports_separate_view_create_update_delete_and_manage_permissions(): void
    {
        $modules = [
            'stats', 'leads', 'services', 'projects', 'clients', 'billing', 'messages',
            'settings', 'bookings', 'portfolio', 'testimonials', 'faqs', 'blog', 'partners', 'team',
        ];

        foreach ($modules as $module) {
            foreach (['view', 'create', 'update', 'delete', 'manage'] as $action) {
                $this->assertTrue(
                    PermissionCatalog::has($action . '_' . $module),
                    "Missing {$action}_{$module} permission."
                );
            }
        }

        $this->assertTrue(PermissionCatalog::has('manage_team'));
    }

    public function test_manage_grants_do_not_authorize_unknown_actions_or_wildcards(): void
    {
        $admin = User::factory()->withPermissions(['manage_projects'])->create([
            'role' => 'custom_admin',
        ]);

        $this->assertTrue($admin->hasPermissionTo('view_projects'));
        $this->assertTrue($admin->hasPermissionTo('create_projects'));
        $this->assertTrue($admin->hasPermissionTo('update_projects'));
        $this->assertTrue($admin->hasPermissionTo('delete_projects'));
        $this->assertFalse($admin->hasPermissionTo('publish_projects'));
        $this->assertFalse($admin->hasPermissionTo('*'));
    }

    public function test_custom_admin_permissions_are_stored_in_normalized_pivot_and_are_explicit(): void
    {
        $admin = User::factory()->withPermissions(['view_leads', 'update_projects'])->create([
            'role' => 'custom_admin',
        ]);

        $this->assertDatabaseHas('permission_user', [
            'user_id' => $admin->id,
            'permission_id' => Permission::query()->where('slug', 'view_leads')->value('id'),
        ]);
        $this->assertTrue($admin->hasPermissionTo('view_leads'));
        $this->assertTrue($admin->hasPermissionTo('update_projects'));
        $this->assertFalse($admin->hasPermissionTo('view_projects'));
        $this->assertFalse($admin->hasPermissionTo('create_projects'));
        $this->assertFalse($admin->hasPermissionTo('delete_projects'));
        $this->assertFalse($admin->hasPermissionTo('manage_projects'));
        $this->assertFalse($admin->hasPermissionTo('manage_clients'));
    }

    public function test_private_media_permissions_follow_the_owning_module(): void
    {
        $clientManager = User::factory()->withPermissions(['manage_clients'])->create([
            'role' => 'custom_admin',
        ]);
        $projectFile = new MediaFile([
            'visibility' => 'private',
            'category' => 'deliverable',
            'owner_type' => Project::class,
        ]);
        $clientFile = new MediaFile([
            'visibility' => 'private',
            'category' => 'document',
            'owner_type' => Client::class,
        ]);
        $messageFile = new MediaFile([
            'visibility' => 'private',
            'category' => 'message_attachment',
            'owner_type' => Project::class,
        ]);

        $this->assertTrue(Gate::forUser($clientManager)->allows('view', $clientFile));
        $this->assertTrue(Gate::forUser($clientManager)->allows('delete', $clientFile));
        $this->assertFalse(Gate::forUser($clientManager)->allows('view', $projectFile));
        $this->assertFalse(Gate::forUser($clientManager)->allows('delete', $projectFile));
        $this->assertFalse(Gate::forUser($clientManager)->allows('view', $messageFile));

        $messageManager = User::factory()->withPermissions(['view_messages'])->create([
            'role' => 'custom_admin',
        ]);
        $this->assertTrue(Gate::forUser($messageManager)->allows('view', $messageFile));
        $this->assertFalse(Gate::forUser($messageManager)->allows('delete', $messageFile));
    }

    public function test_manage_permission_grants_all_actions_only_inside_its_module(): void
    {
        $admin = User::factory()->withPermissions(['manage_projects'])->create([
            'role' => 'custom_admin',
        ]);

        $this->assertTrue($admin->hasPermissionTo('view_projects'));
        $this->assertTrue($admin->hasPermissionTo('create_projects'));
        $this->assertTrue($admin->hasPermissionTo('update_projects'));
        $this->assertTrue($admin->hasPermissionTo('delete_projects'));
        $this->assertFalse($admin->hasPermissionTo('view_clients'));
    }

    public function test_wildcard_permission_does_not_exist_and_cannot_be_assigned_through_team_api(): void
    {
        $superAdmin = User::factory()->create(['role' => 'super_admin']);
        $admin = User::factory()->create(['role' => 'custom_admin']);

        $this->assertFalse($admin->hasPermissionTo('*'));
        $this->assertDatabaseMissing('permissions', ['slug' => '*']);

        $this->actingAs($superAdmin)->putJson('/api/team/' . $admin->id . '/permissions', [
            'permissions' => ['*'],
        ])->assertUnprocessable();
    }

    public function test_super_admin_has_all_permissions_and_client_has_no_administrative_permissions(): void
    {
        $superAdmin = User::factory()->create(['role' => 'super_admin']);
        $client = User::factory()->create(['role' => 'client']);

        foreach (PermissionCatalog::slugs() as $permission) {
            $this->assertTrue($superAdmin->hasPermissionTo($permission));
            $this->assertFalse($client->hasPermissionTo($permission));
        }
    }

    public function test_legacy_json_permission_mirror_cannot_grant_permissions(): void
    {
        $admin = User::factory()->create(['role' => 'custom_admin']);

        \Illuminate\Support\Facades\DB::table('users')
            ->where('id', $admin->id)
            ->update(['permissions' => json_encode(['manage_clients'])]);

        $admin->refresh();
        $this->assertSame([], $admin->permissions);
        $this->assertFalse($admin->hasPermissionTo('manage_clients'));
    }

    public function test_changing_a_custom_admin_to_client_revokes_normalized_grants(): void
    {
        $admin = User::factory()->withPermissions(['manage_projects'])->create([
            'role' => 'custom_admin',
        ]);

        $this->assertTrue($admin->hasPermissionTo('update_projects'));

        $admin->role = 'client';
        $admin->save();
        $admin->refresh();

        $this->assertSame('client', $admin->role);
        $this->assertSame([], $admin->permissions);
        $this->assertFalse($admin->hasPermissionTo('update_projects'));
        $this->assertDatabaseMissing('permission_user', ['user_id' => $admin->id]);
    }

    public function test_role_id_is_authoritative_and_legacy_role_column_cannot_escalate_privileges(): void
    {
        $admin = User::factory()->create(['role' => 'custom_admin']);

        // The compatibility column is retained for older read-only integrations,
        // but authorization derives the role from users.role_id -> roles.slug.
        \Illuminate\Support\Facades\DB::table('users')
            ->where('id', $admin->id)
            ->update(['role' => 'super_admin']);

        $admin->refresh();
        $this->assertSame('custom_admin', $admin->role);
        $this->assertFalse($admin->hasPermissionTo('manage_clients'));
    }

    public function test_team_management_requires_explicit_grants_and_protects_super_admin_and_self(): void
    {
        $customAdmin = User::factory()->withPermissions(['view_leads'])->create([
            'role' => 'custom_admin',
        ]);
        $superAdmin = User::factory()->create(['role' => 'super_admin']);

        $this->actingAs($customAdmin)->getJson('/api/team')->assertForbidden();
        $this->actingAs($customAdmin)->getJson('/api/team/permission-catalog')->assertForbidden();
        $this->actingAs($customAdmin)->postJson('/api/team/invite', [
            'name' => 'Unauthorized Member',
            'email' => 'unauthorized@example.test',
            'role' => 'custom_admin',
            'permissions' => [],
        ])->assertForbidden();

        $this->actingAs($superAdmin)->putJson('/api/team/' . $customAdmin->id . '/permissions', [
            'permissions' => ['*'],
        ])->assertUnprocessable();

        $this->actingAs($superAdmin)->putJson('/api/team/' . $superAdmin->id . '/permissions', [
            'permissions' => [],
        ])->assertNotFound();
        $this->actingAs($superAdmin)->putJson('/api/team/' . $superAdmin->id . '/status', [
            'is_active' => false,
        ])->assertNotFound();
        $this->actingAs($superAdmin)->postJson('/api/team/' . $superAdmin->id . '/revoke-sessions')
            ->assertNotFound();

        $otherSuperAdmin = User::factory()->create(['role' => 'super_admin']);
        $this->actingAs($superAdmin)->putJson('/api/team/' . $otherSuperAdmin->id . '/status', [
            'is_active' => false,
        ])->assertNotFound();

        $catalogResponse = $this->actingAs($superAdmin)->getJson('/api/team/permission-catalog')->assertOk()
            ->assertJsonPath('success', true);
        $catalog = collect($catalogResponse->json('data'));
        $this->assertCount(count(PermissionCatalog::slugs()), $catalog);
        $this->assertTrue($catalog->contains('slug', 'manage_team'));
    }

    public function test_delegated_team_manager_cannot_grant_permissions_they_do_not_hold(): void
    {
        Notification::fake();
        $manager = User::factory()->withPermissions(['manage_team', 'view_leads'])->create([
            'role' => 'custom_admin',
        ]);
        $target = User::factory()->create(['role' => 'custom_admin']);
        $superAdmin = User::factory()->create(['role' => 'super_admin']);

        $this->actingAs($manager)->getJson('/api/team')->assertOk()
            ->assertJsonMissing(['id' => $superAdmin->id]);

        $invite = $this->actingAs($manager)->postJson('/api/team/invite', [
            'name' => 'Delegated Admin',
            'email' => 'delegated-admin@example.test',
            'role' => 'custom_admin',
            'permissions' => ['view_leads'],
        ]);
        $invite->assertCreated()->assertJsonPath('data.user.role', 'custom_admin');

        $this->actingAs($manager)->postJson('/api/team/invite', [
            'name' => 'Escalated Admin',
            'email' => 'escalated-admin@example.test',
            'role' => 'custom_admin',
            'permissions' => ['manage_projects'],
        ])->assertForbidden();

        $this->actingAs($manager)->postJson('/api/team/invite', [
            'name' => 'Privilege Escalation',
            'email' => 'super-admin-attempt@example.test',
            'role' => 'super_admin',
            'permissions' => [],
        ])->assertUnprocessable();

        $this->actingAs($manager)->putJson('/api/team/' . $target->id . '/permissions', [
            'permissions' => ['manage_projects'],
        ])->assertForbidden();

        // A delegated manager may grant permissions it already holds.
        $this->actingAs($manager)->putJson('/api/team/' . $target->id . '/permissions', [
            'permissions' => ['view_leads'],
        ])->assertOk();
        $target->refresh();
        $this->assertSame(['view_leads'], $target->permissions);

        // A manager cannot modify its own grants or a Super Admin account.
        $this->actingAs($manager)->putJson('/api/team/' . $manager->id . '/permissions', [
            'permissions' => ['manage_team', 'view_leads'],
        ])->assertForbidden();

        $this->actingAs($manager)->putJson('/api/team/' . $superAdmin->id . '/status', [
            'is_active' => false,
        ])->assertNotFound();

        // update_team alone permits status/session operations, not permission grants.
        $statusManager = User::factory()->withPermissions(['update_team'])->create([
            'role' => 'custom_admin',
        ]);
        $this->actingAs($statusManager)->putJson('/api/team/' . $target->id . '/permissions', [
            'permissions' => ['view_leads'],
        ])->assertForbidden();
        $this->actingAs($statusManager)->putJson('/api/team/' . $target->id . '/status', [
            'is_active' => false,
        ])->assertOk();
    }




    public function test_team_member_policy_enforces_delegated_team_permissions(): void
    {
        $viewer = User::factory()->withPermissions(['view_team'])->create([
            'role' => 'custom_admin',
        ]);
        $manager = User::factory()->withPermissions(['manage_team', 'view_leads'])->create([
            'role' => 'custom_admin',
        ]);
        $target = User::factory()->create(['role' => 'custom_admin']);
        $client = User::factory()->create(['role' => 'client']);

        $this->assertTrue(Gate::forUser($viewer)->allows('viewAny', User::class));
        $this->assertFalse(Gate::forUser($viewer)->allows('create', User::class));
        $this->assertFalse(Gate::forUser($viewer)->allows('updatePermissions', $target));

        $this->assertTrue(Gate::forUser($manager)->allows('updatePermissions', $target));
        $this->assertTrue(Gate::forUser($manager)->allows('grantPermissions', [$target, ['view_leads']]));
        $this->assertFalse(Gate::forUser($manager)->allows('grantPermissions', [$target, ['manage_projects']]));
        $this->assertFalse(Gate::forUser($manager)->allows('updatePermissions', $manager));

        $this->assertFalse(Gate::forUser($client)->allows('viewAny', User::class));
        $this->assertFalse(Gate::forUser($client)->allows('create', User::class));
    }

    public function test_inactive_custom_admin_cannot_use_team_permissions(): void
    {
        $inactive = User::factory()->withPermissions(['manage_team'])->create([
            'role' => 'custom_admin',
            'is_active' => false,
            'suspended_at' => now(),
        ]);

        $this->assertFalse($inactive->hasPermissionTo('view_team'));
        $this->assertFalse(Gate::forUser($inactive)->allows('viewAny', User::class));
        $this->assertFalse(Gate::forUser($inactive)->allows('create', User::class));
    }


    public function test_custom_admin_cannot_change_own_team_account_or_any_super_admin(): void
    {
        $manager = User::factory()->withPermissions(['manage_team'])->create([
            'role' => 'custom_admin',
        ]);
        $targetSuperAdmin = User::factory()->create(['role' => 'super_admin']);
        $targetAdmin = User::factory()->create(['role' => 'custom_admin']);

        $this->actingAs($manager)->putJson('/api/team/' . $manager->id . '/status', [
            'is_active' => false,
        ])->assertForbidden();
        $this->actingAs($manager)->postJson('/api/team/' . $manager->id . '/revoke-sessions')
            ->assertForbidden();
        $this->actingAs($manager)->postJson('/api/team/' . $manager->id . '/resend-invitation')
            ->assertForbidden();

        $this->actingAs($manager)->putJson('/api/team/' . $targetSuperAdmin->id . '/permissions', [
            'permissions' => [],
        ])->assertNotFound();
        $this->actingAs($manager)->putJson('/api/team/' . $targetSuperAdmin->id . '/status', [
            'is_active' => false,
        ])->assertNotFound();
        $this->actingAs($manager)->postJson('/api/team/' . $targetSuperAdmin->id . '/revoke-sessions')
            ->assertNotFound();
        $this->actingAs($manager)->postJson('/api/team/' . $targetSuperAdmin->id . '/resend-invitation')
            ->assertNotFound();

        $this->assertTrue($manager->fresh()->isActive());
        $this->assertTrue($targetAdmin->fresh()->isActive());
        $this->assertTrue($targetSuperAdmin->fresh()->isActive());
    }

    public function test_manage_team_implies_only_canonical_team_actions(): void
    {
        $manager = User::factory()->withPermissions(['manage_team'])->create([
            'role' => 'custom_admin',
        ]);

        foreach (['view_team', 'create_team', 'update_team', 'delete_team'] as $permission) {
            $this->assertTrue($manager->hasPermissionTo($permission), "Expected {$permission} to be implied by manage_team.");
        }

        $this->assertFalse($manager->hasPermissionTo('publish_team'));
        $this->assertFalse($manager->hasPermissionTo('*'));
        $this->assertFalse($manager->hasPermissionTo('manage_clients'));
    }

    public function test_delegated_creator_can_create_an_unprivileged_custom_admin_without_granting_permissions(): void
    {
        Notification::fake();
        $creator = User::factory()->withPermissions(['create_team'])->create([
            'role' => 'custom_admin',
        ]);

        $response = $this->actingAs($creator)->postJson('/api/team/invite', [
            'name' => 'Limited Team Member',
            'email' => 'limited-team-member@example.test',
            'role' => 'custom_admin',
            'permissions' => [],
        ])->assertCreated();

        $member = User::query()->findOrFail((int) $response->json('data.user.id'));
        $this->assertSame([], $member->permissions);
        $this->assertFalse($member->hasPermissionTo('view_leads'));
    }

    public function test_super_admin_can_manage_custom_admin_permissions_and_status(): void
    {
        Notification::fake();
        $superAdmin = User::factory()->create(['role' => 'super_admin']);

        $invite = $this->actingAs($superAdmin)->postJson('/api/team/invite', [
            'name' => 'Operations Admin',
            'email' => 'operations-admin@example.test',
            'role' => 'custom_admin',
            'permissions' => ['view_leads'],
        ]);

        $invite->assertCreated()->assertJsonPath('data.user.role', 'custom_admin');
        if (config('mail.default') === 'log') {
            $invite->assertJsonPath('data.invitation_sent', false);
        }
        $memberId = (int) $invite->json('data.user.id');
        $member = User::query()->findOrFail($memberId);

        $this->assertTrue($member->hasPermissionTo('view_leads'));
        $this->assertFalse($member->hasPermissionTo('update_leads'));

        $this->actingAs($superAdmin)->putJson('/api/team/' . $memberId . '/permissions', [
            'permissions' => ['manage_projects', 'view_billing'],
        ])->assertOk();

        $member->refresh();
        $this->assertFalse($member->hasPermissionTo('view_leads'));
        $this->assertTrue($member->hasPermissionTo('delete_projects'));
        $this->assertTrue($member->hasPermissionTo('view_billing'));
        $this->assertFalse($member->hasPermissionTo('update_billing'));

        $this->actingAs($superAdmin)->putJson('/api/team/' . $memberId . '/permissions', [
            'permissions' => [],
        ])->assertOk();
        $member->refresh();
        $this->assertSame([], $member->permissions);
        $this->assertFalse($member->hasPermissionTo('delete_projects'));

        // Restore one grant so the remaining status/session checks continue to
        // exercise a member with assigned permissions.
        $this->actingAs($superAdmin)->putJson('/api/team/' . $memberId . '/permissions', [
            'permissions' => ['view_leads'],
        ])->assertOk();

        $this->actingAs($superAdmin)->putJson('/api/team/' . $memberId . '/status', [
            'is_active' => true,
        ])->assertOk();
        $this->assertTrue($member->fresh()->isActive());

        $this->actingAs($superAdmin)->putJson('/api/team/' . $memberId . '/status', [
            'is_active' => false,
        ])->assertOk();

        $member->refresh();
        $this->assertFalse($member->isActive());
        $this->assertSame(3, (int) $member->auth_version);

        $this->actingAs($superAdmin)->postJson('/api/team/' . $memberId . '/revoke-sessions')
            ->assertOk();
        $this->assertSame(4, (int) $member->fresh()->auth_version);
    }

    public function test_only_custom_admins_can_receive_explicit_permissions(): void
    {
        $client = User::factory()->create(['role' => 'client']);

        $this->expectException(\InvalidArgumentException::class);
        $client->syncPermissions(['view_leads']);
    }
}
