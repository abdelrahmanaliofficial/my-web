<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('projects', function (Blueprint $table): void {
            if (!Schema::hasColumn('projects', 'project_code')) {
                $table->string('project_code', 32)->unique()->after('id');
            }
            if (!Schema::hasColumn('projects', 'name')) {
                $table->string('name')->after('client_id');
            }
            if (!Schema::hasColumn('projects', 'service_category')) {
                $table->string('service_category', 120)->default('general')->after('name');
                $table->index('service_category');
            }
            if (!Schema::hasColumn('projects', 'description')) {
                $table->text('description')->nullable()->after('service_category');
            }
            if (!Schema::hasColumn('projects', 'start_date')) {
                $table->date('start_date')->nullable()->after('description');
            }
            if (!Schema::hasColumn('projects', 'expected_completion_date')) {
                $table->date('expected_completion_date')->nullable()->after('start_date');
            }
            if (!Schema::hasColumn('projects', 'priority')) {
                $table->enum('priority', ['low', 'medium', 'high', 'urgent'])->default('medium')->after('status');
                $table->index('priority');
            }
            if (!Schema::hasColumn('projects', 'progress_percentage')) {
                $table->unsignedTinyInteger('progress_percentage')->default(0)->after('priority');
            }
            if (!Schema::hasColumn('projects', 'assigned_team_member_id')) {
                $table->foreignId('assigned_team_member_id')
                    ->nullable()
                    ->after('progress_percentage')
                    ->constrained('users')
                    ->nullOnDelete();
                $table->index('assigned_team_member_id');
            }
            // Widen status from legacy enum to string(40) supporting all 6 workflow states portably
            $table->string('status', 40)->default('planning')->index()->change();
        });
    }

    public function down(): void
    {
        Schema::table('projects', function (Blueprint $table): void {
            if (Schema::hasColumn('projects', 'assigned_team_member_id')) {
                $table->dropConstrainedForeignId('assigned_team_member_id');
            }
            foreach ([
                'project_code',
                'name',
                'service_category',
                'description',
                'start_date',
                'expected_completion_date',
                'priority',
                'progress_percentage',
            ] as $column) {
                if (Schema::hasColumn('projects', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }
};
