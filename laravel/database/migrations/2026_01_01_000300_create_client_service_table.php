<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('client_service')) {
            Schema::create('client_service', function (Blueprint $table) {
                $table->id();
                $table->foreignId('client_id')->constrained('clients')->cascadeOnDelete();
                $table->foreignId('service_id')->constrained('services')->cascadeOnDelete();
                $table->enum('contract_status', ['active', 'paused', 'completed'])->default('active');
                $table->timestamp('assigned_at')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->unique(['client_id', 'service_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('client_service');
    }
};
