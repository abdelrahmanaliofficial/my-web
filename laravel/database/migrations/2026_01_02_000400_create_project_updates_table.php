<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('project_updates')) {
            Schema::create('project_updates', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('project_id')->constrained('projects')->cascadeOnDelete();
                $table->foreignId('author_id')->nullable()->constrained('users')->nullOnDelete();
                $table->enum('type', [
                    'progress_update',
                    'internal_note',
                    'approval_request',
                    'client_decision',
                ])->default('progress_update')->index();
                $table->string('title')->nullable();
                $table->text('body');
                $table->boolean('is_internal')->default(false)->index();
                $table->enum('approval_status', ['pending', 'approved', 'changes_requested'])->nullable()->index();
                $table->foreignId('responded_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamp('responded_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('project_updates');
    }
};
