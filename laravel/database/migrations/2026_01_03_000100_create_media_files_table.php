<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('media_files')) {
            Schema::create('media_files', function (Blueprint $table): void {
                $table->id();
                $table->string('file_uid', 36)->unique();
                $table->enum('visibility', ['public', 'private'])->default('private')->index();
                $table->string('category', 64)->index();
                $table->string('original_filename', 255);
                $table->string('stored_filename', 255);
                $table->string('disk', 40)->index();
                $table->string('storage_path', 512)->unique();
                $table->string('mime_type', 120);
                $table->string('extension', 20);
                $table->unsignedBigInteger('file_size');
                $table->string('checksum_sha256', 64)->nullable();
                $table->string('owner_type', 120)->nullable();
                $table->unsignedBigInteger('owner_id')->nullable();
                $table->foreignId('uploaded_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['owner_type', 'owner_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('media_files');
    }
};
