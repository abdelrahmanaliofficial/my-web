<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('invoice_payments')) {
            Schema::create('invoice_payments', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('invoice_id')->constrained('invoices')->cascadeOnDelete();
                $table->foreignId('client_id')->constrained('clients')->cascadeOnDelete();
                $table->foreignId('recorded_by')->nullable()->constrained('users')->nullOnDelete();
                $table->string('payment_reference', 64)->unique();
                $table->decimal('amount', 12, 2);
                $table->string('currency', 3)->default('USD');
                $table->enum('payment_method', [
                    'bank_transfer',
                    'wire',
                    'cash',
                    'check',
                    'other',
                ])->default('bank_transfer');
                $table->timestamp('paid_at');
                $table->string('notes', 500)->nullable();
                $table->timestamps();

                $table->index(['invoice_id', 'paid_at']);
                $table->index(['client_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('invoice_payments');
    }
};
