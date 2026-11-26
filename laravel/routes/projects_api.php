<?php

use App\Http\Controllers\Api\ClientProjectController;
use App\Http\Controllers\Api\ProjectController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'account.active'])->group(function (): void {
    // Client-scoped portal endpoints (client derived solely from auth()->user())
    Route::prefix('/client/projects')->group(function (): void {
        Route::get('/', [ClientProjectController::class, 'index']);
        Route::get('/{project}', [ClientProjectController::class, 'show']);
        Route::get('/{project}/files', [ClientProjectController::class, 'files']);
        Route::post('/{project}/approvals/{update}/respond', [ClientProjectController::class, 'respondToApproval']);
    });

    // Administrative project management endpoints (enforced via ProjectPolicy & MediaFilePolicy)
    Route::prefix('/projects')->group(function (): void {
        Route::get('/assignment-options', [ProjectController::class, 'assignmentOptions']);
        Route::get('/', [ProjectController::class, 'index']);
        Route::post('/', [ProjectController::class, 'store']);
        Route::get('/{project}', [ProjectController::class, 'show']);
        Route::put('/{project}', [ProjectController::class, 'update']);
        Route::put('/{project}/status', [ProjectController::class, 'updateStatus']);
        Route::delete('/{project}', [ProjectController::class, 'destroy']);

        Route::get('/{project}/files', [ProjectController::class, 'files']);
        Route::post('/{project}/files', [ProjectController::class, 'storeFile']);
        Route::post('/{project}/files/{fileUid}/replace', [ProjectController::class, 'replaceFile']);
        Route::delete('/{project}/files/{fileUid}', [ProjectController::class, 'destroyFile']);

        Route::post('/{project}/milestones', [ProjectController::class, 'storeMilestone']);
        Route::put('/{project}/milestones/reorder', [ProjectController::class, 'reorderMilestones']);
        Route::put('/{project}/milestones/{milestone}', [ProjectController::class, 'updateMilestone']);
        Route::delete('/{project}/milestones/{milestone}', [ProjectController::class, 'destroyMilestone']);

        Route::post('/{project}/tasks', [ProjectController::class, 'storeTask']);
        Route::put('/{project}/tasks/{task}', [ProjectController::class, 'updateTask']);
        Route::delete('/{project}/tasks/{task}', [ProjectController::class, 'destroyTask']);

        Route::post('/{project}/updates', [ProjectController::class, 'storeUpdate']);
        Route::post('/{project}/approvals/{update}/respond', [ProjectController::class, 'recordApprovalDecision']);
    });
});
