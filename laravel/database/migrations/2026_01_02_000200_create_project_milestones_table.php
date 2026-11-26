<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('project_milestones')) {
            Schema::create('project_milestones', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
                $table->string('title');
                $table->text('description')->nullable();
                $table->date('due_date')->nullable()->index();
                $table->enum('status', ['pending', 'in_progress', 'completed'])->default('pending')->index();
                $table->unsignedInteger('sort_order')->default(0)->index();
                $table->timestamp('completed_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('project_milestones');
    }
};
