<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('clients')) {
            Schema::create('clients', function (Blueprint $table) {
                $table->id();
                $table->string('client_code', 32)->unique();
                $table->foreignId('user_id')->nullable()->unique()->constrained('users')->nullOnDelete();
                $table->string('full_name');
                $table->string('email')->unique();
                $table->string('phone', 50)->nullable();
                $table->string('company_name')->nullable();
                $table->text('address')->nullable();
                $table->enum('account_status', ['invited', 'active', 'suspended'])->default('invited')->index();
                $table->timestamp('invited_at')->nullable();
                $table->timestamp('activated_at')->nullable();
                $table->timestamp('suspended_at')->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('clients');
    }
};
