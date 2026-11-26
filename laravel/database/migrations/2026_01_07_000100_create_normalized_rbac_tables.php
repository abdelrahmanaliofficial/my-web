<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('roles')) {
            Schema::create('roles', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 100);
                $table->string('slug', 50)->unique();
                $table->string('description', 255)->nullable();
                $table->timestamps();
            });
        }

        if (!Schema::hasTable('permissions')) {
            Schema::create('permissions', function (Blueprint $table): void {
                $table->id();
                $table->string('name', 120);
                $table->string('slug', 100)->unique();
                $table->string('module', 60)->index();
                $table->string('action', 30);
                $table->string('description', 255)->nullable();
                $table->timestamps();
            });
        }

        $now = now();
        $roles = [
            ['name' => 'Super Admin', 'slug' => 'super_admin', 'description' => 'Full system access.'],
            ['name' => 'Custom Admin', 'slug' => 'custom_admin', 'description' => 'Access only to explicitly assigned permissions.'],
            ['name' => 'Client', 'slug' => 'client', 'description' => 'Access only to the authenticated client own records.'],
        ];

        foreach ($roles as $role) {
            DB::table('roles')->updateOrInsert(['slug' => $role['slug']], $role + ['created_at' => $now, 'updated_at' => $now]);
        }

        $definitions = [
            'view_stats' => ['stats', 'view'],
            'create_stats' => ['stats', 'create'],
            'update_stats' => ['stats', 'update'],
            'delete_stats' => ['stats', 'delete'],
            'manage_stats' => ['stats', 'manage'],
            'view_leads' => ['leads', 'view'],
            'create_leads' => ['leads', 'create'],
            'update_leads' => ['leads', 'update'],
            'delete_leads' => ['leads', 'delete'],
            'manage_leads' => ['leads', 'manage'],
            'view_services' => ['services', 'view'],
            'create_services' => ['services', 'create'],
            'update_services' => ['services', 'update'],
            'delete_services' => ['services', 'delete'],
            'manage_services' => ['services', 'manage'],
            'view_projects' => ['projects', 'view'],
            'create_projects' => ['projects', 'create'],
            'update_projects' => ['projects', 'update'],
            'delete_projects' => ['projects', 'delete'],
            'manage_projects' => ['projects', 'manage'],
            'view_clients' => ['clients', 'view'],
            'create_clients' => ['clients', 'create'],
            'update_clients' => ['clients', 'update'],
            'delete_clients' => ['clients', 'delete'],
            'manage_clients' => ['clients', 'manage'],
            'view_billing' => ['billing', 'view'],
            'create_billing' => ['billing', 'create'],
            'update_billing' => ['billing', 'update'],
            'delete_billing' => ['billing', 'delete'],
            'manage_billing' => ['billing', 'manage'],
            'view_messages' => ['messages', 'view'],
            'create_messages' => ['messages', 'create'],
            'update_messages' => ['messages', 'update'],
            'delete_messages' => ['messages', 'delete'],
            'manage_messages' => ['messages', 'manage'],
            'view_settings' => ['settings', 'view'],
            'create_settings' => ['settings', 'create'],
            'update_settings' => ['settings', 'update'],
            'delete_settings' => ['settings', 'delete'],
            'manage_settings' => ['settings', 'manage'],
            'view_bookings' => ['bookings', 'view'],
            'create_bookings' => ['bookings', 'create'],
            'update_bookings' => ['bookings', 'update'],
            'delete_bookings' => ['bookings', 'delete'],
            'manage_bookings' => ['bookings', 'manage'],
            'view_portfolio' => ['portfolio', 'view'],
            'create_portfolio' => ['portfolio', 'create'],
            'update_portfolio' => ['portfolio', 'update'],
            'delete_portfolio' => ['portfolio', 'delete'],
            'manage_portfolio' => ['portfolio', 'manage'],
            'view_testimonials' => ['testimonials', 'view'],
            'create_testimonials' => ['testimonials', 'create'],
            'update_testimonials' => ['testimonials', 'update'],
            'delete_testimonials' => ['testimonials', 'delete'],
            'manage_testimonials' => ['testimonials', 'manage'],
            'view_faqs' => ['faqs', 'view'],
            'create_faqs' => ['faqs', 'create'],
            'update_faqs' => ['faqs', 'update'],
            'delete_faqs' => ['faqs', 'delete'],
            'manage_faqs' => ['faqs', 'manage'],
            'view_blog' => ['blog', 'view'],
            'create_blog' => ['blog', 'create'],
            'update_blog' => ['blog', 'update'],
            'delete_blog' => ['blog', 'delete'],
            'manage_blog' => ['blog', 'manage'],
            'view_partners' => ['partners', 'view'],
            'create_partners' => ['partners', 'create'],
            'update_partners' => ['partners', 'update'],
            'delete_partners' => ['partners', 'delete'],
            'manage_partners' => ['partners', 'manage'],
            'view_team' => ['team', 'view'], 'create_team' => ['team', 'create'], 'update_team' => ['team', 'update'], 'delete_team' => ['team', 'delete'], 'manage_team' => ['team', 'manage'],
        ];

        foreach ($definitions as $slug => [$module, $action]) {
            DB::table('permissions')->updateOrInsert(
                ['slug' => $slug],
                [
                    'name' => ucwords(str_replace('_', ' ', $slug)),
                    'module' => $module,
                    'action' => $action,
                    'description' => null,
                    'created_at' => $now,
                    'updated_at' => $now,
                ]
            );
        }

        if (Schema::hasTable('users') && !Schema::hasColumn('users', 'role_id')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->foreignId('role_id')->nullable()->after('role')->constrained('roles')->restrictOnDelete();
            });
        }

        if (!Schema::hasTable('permission_user')) {
            Schema::create('permission_user', function (Blueprint $table): void {
                $table->foreignId('user_id')->constrained('users')->cascadeOnDelete();
                $table->foreignId('permission_id')->constrained('permissions')->cascadeOnDelete();
                $table->foreignId('granted_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();
                $table->primary(['user_id', 'permission_id']);
                $table->index(['permission_id', 'user_id']);
            });
        }

        if (Schema::hasTable('users')) {
            $roleIds = DB::table('roles')->pluck('id', 'slug');
            $permissionIds = DB::table('permissions')->pluck('id', 'slug');

            foreach (DB::table('users')->select(['id', 'role', 'permissions'])->orderBy('id')->get() as $user) {
                $roleSlug = in_array($user->role, ['super_admin', 'custom_admin', 'client'], true)
                    ? $user->role
                    : 'client';
                $roleId = $roleIds[$roleSlug] ?? $roleIds['client'];

                DB::table('users')->where('id', $user->id)->update([
                    'role_id' => $roleId,
                    'role' => $roleSlug,
                ]);

                // Migrate legacy JSON grants only for custom administrators.
                // The normalized pivot becomes authoritative after this migration.
                $migratedSlugs = [];
                if ($roleSlug === 'custom_admin' && !empty($user->permissions)) {
                    $legacy = is_array($user->permissions)
                        ? $user->permissions
                        : json_decode((string) $user->permissions, true);
                    if (is_array($legacy)) {
                        foreach (array_unique($legacy) as $slug) {
                            if (!is_string($slug) || !isset($permissionIds[$slug])) {
                                continue;
                            }
                            DB::table('permission_user')->insertOrIgnore([
                                'user_id' => $user->id,
                                'permission_id' => $permissionIds[$slug],
                                'granted_by' => null,
                                'created_at' => $now,
                                'updated_at' => $now,
                            ]);
                            $migratedSlugs[] = $slug;
                        }
                    }
                }

                // Keep a sanitized compatibility mirror only; authorization reads permission_user.
                DB::table('users')->where('id', $user->id)->update([
                    'permissions' => json_encode($migratedSlugs, JSON_THROW_ON_ERROR),
                ]);
            }
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('permission_user');

        if (Schema::hasTable('users') && Schema::hasColumn('users', 'role_id')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropConstrainedForeignId('role_id');
            });
        }

        Schema::dropIfExists('permissions');
        Schema::dropIfExists('roles');
    }
};
