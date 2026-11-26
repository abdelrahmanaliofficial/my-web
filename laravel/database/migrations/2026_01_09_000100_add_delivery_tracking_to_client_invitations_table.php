<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('client_invitations')) {
            return;
        }

        $hasDeliveryStatus = Schema::hasColumn('client_invitations', 'delivery_status');
        $hasAcceptedAt = Schema::hasColumn('client_invitations', 'delivery_accepted_at');
        $hasDeliveryError = Schema::hasColumn('client_invitations', 'delivery_error');

        if ($hasDeliveryStatus && $hasAcceptedAt && $hasDeliveryError) {
            return;
        }

        Schema::table('client_invitations', function (Blueprint $table) use ($hasDeliveryStatus, $hasAcceptedAt, $hasDeliveryError): void {
            if (!$hasDeliveryStatus) {
                $table->string('delivery_status', 24)->default('pending')->index();
            }
            if (!$hasAcceptedAt) {
                $table->timestamp('delivery_accepted_at')->nullable();
            }
            if (!$hasDeliveryError) {
                $table->text('delivery_error')->nullable();
            }
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('client_invitations')) {
            return;
        }

        $hasDeliveryStatus = Schema::hasColumn('client_invitations', 'delivery_status');
        $hasAcceptedAt = Schema::hasColumn('client_invitations', 'delivery_accepted_at');
        $hasDeliveryError = Schema::hasColumn('client_invitations', 'delivery_error');

        if (!$hasDeliveryStatus && !$hasAcceptedAt && !$hasDeliveryError) {
            return;
        }

        Schema::table('client_invitations', function (Blueprint $table) use ($hasDeliveryStatus, $hasAcceptedAt, $hasDeliveryError): void {
            if ($hasDeliveryStatus) {
                $table->dropIndex(['delivery_status']);
                $table->dropColumn('delivery_status');
            }
            if ($hasAcceptedAt) {
                $table->dropColumn('delivery_accepted_at');
            }
            if ($hasDeliveryError) {
                $table->dropColumn('delivery_error');
            }
        });
    }
};
