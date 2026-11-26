<?php

use App\Http\Controllers\Api\ClientConversationController;
use App\Http\Controllers\Api\ConversationController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'account.active'])->group(function (): void {
    // Client-scoped messaging endpoints (client derived solely from auth()->user())
    Route::prefix('/client/conversations')->group(function (): void {
        Route::get('/', [ClientConversationController::class, 'index']);
        Route::get('/unread-summary', [ClientConversationController::class, 'unreadSummary']);
        Route::get('/{conversation}', [ClientConversationController::class, 'show']);
        Route::post('/{conversation}/messages', [ClientConversationController::class, 'reply']);
        Route::post('/{conversation}/read', [ClientConversationController::class, 'markAsRead']);
    });

    // Administrative messaging endpoints (enforced via ConversationPolicy)
    Route::get('/conversation-options', [ConversationController::class, 'options']);

    Route::prefix('/conversations')->group(function (): void {
        Route::get('/', [ConversationController::class, 'index']);
        Route::get('/unread-summary', [ConversationController::class, 'unreadSummary']);
        Route::post('/', [ConversationController::class, 'store']);
        Route::get('/{conversation}', [ConversationController::class, 'show']);
        Route::post('/{conversation}/messages', [ConversationController::class, 'sendMessage']);
        Route::post('/{conversation}/read', [ConversationController::class, 'markAsRead']);
        Route::post('/{conversation}/archive', [ConversationController::class, 'archive']);
        Route::post('/{conversation}/reopen', [ConversationController::class, 'reopen']);
    });
});
