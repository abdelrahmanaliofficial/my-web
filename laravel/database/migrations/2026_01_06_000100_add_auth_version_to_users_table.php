<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('users') && !Schema::hasColumn('users', 'auth_version')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->unsignedBigInteger('auth_version')->default(1)->after('password');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasTable('users') && Schema::hasColumn('users', 'auth_version')) {
            Schema::table('users', function (Blueprint $table): void {
                $table->dropColumn('auth_version');
            });
        }
    }
};
