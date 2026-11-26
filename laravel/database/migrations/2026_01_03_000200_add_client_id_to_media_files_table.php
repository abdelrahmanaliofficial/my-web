<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('media_files') && !Schema::hasColumn('media_files', 'client_id')) {
            Schema::table('media_files', function (Blueprint $table): void {
                $table->foreignId('client_id')
                    ->nullable()
                    ->after('owner_id')
                    ->constrained('clients')
                    ->nullOnDelete();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('media_files') && Schema::hasColumn('media_files', 'client_id')) {
            Schema::table('media_files', function (Blueprint $table): void {
                $table->dropConstrainedForeignId('client_id');
            });
        }
    }
};
