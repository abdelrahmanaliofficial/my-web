<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Add the Team module's action permissions independently of the original
     * RBAC migration. This is safe when that earlier migration has already run
     * on an existing development database.
     */
    public function up(): void
    {
        $now = now();
        $permissions = [
            'view_team' => ['team', 'view'],
            'create_team' => ['team', 'create'],
            'update_team' => ['team', 'update'],
            'delete_team' => ['team', 'delete'],
            'manage_team' => ['team', 'manage'],
        ];

        foreach ($permissions as $slug => [$module, $action]) {
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
    }

    public function down(): void
    {
        // Intentionally non-destructive: team permissions may already be
        // assigned to Custom Admin accounts. Rollback must not cascade-delete
        // those grants or silently remove access-control configuration.
    }
};
