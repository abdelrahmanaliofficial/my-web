<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('invoices')) {
            Schema::create('invoices', function (Blueprint $table): void {
                $table->id();
                $table->string('invoice_number', 40)->unique();
                $table->foreignId('client_id')->constrained('clients')->cascadeOnDelete();
                $table->foreignId('project_id')->nullable()->constrained('projects')->nullOnDelete();
                $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
                $table->text('description')->nullable();
                $table->decimal('amount', 12, 2);
                $table->decimal('paid_amount', 12, 2)->default(0);
                $table->string('currency', 3)->default('USD');
                $table->date('issue_date')->nullable();
                $table->date('due_date')->nullable();
                $table->enum('status', [
                    'draft',
                    'issued',
                    'partially_paid',
                    'paid',
                    'overdue',
                    'cancelled',
                ])->default('draft')->index();
                $table->timestamp('issued_at')->nullable();
                $table->timestamp('paid_at')->nullable();
                $table->timestamp('cancelled_at')->nullable();
                $table->text('notes')->nullable();
                $table->timestamps();

                $table->index(['client_id', 'status']);
                $table->index(['project_id']);
                $table->index(['due_date']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('invoices');
    }
};
