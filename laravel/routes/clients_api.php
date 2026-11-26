<?php

use App\Http\Controllers\Api\ClientController;
use App\Http\Controllers\Api\ClientSelfController;
use App\Http\Controllers\Api\ServiceController;
use Illuminate\Support\Facades\Route;

// Public rate-limited invitation verification & password setup completion
Route::middleware(['throttle:15,1'])->group(function (): void {
    // POST keeps the raw invitation token out of the API query string and access logs.
    Route::post('/client-invitations/verify', [ClientSelfController::class, 'verifyInvitation']);
    // GET remains temporarily available for links issued before fragment-token support.
    Route::get('/client-invitations/verify', [ClientSelfController::class, 'verifyInvitation']);
    Route::post('/client-invitations/accept', [ClientSelfController::class, 'acceptInvitation']);
});

Route::middleware(['auth:sanctum', 'account.active'])->group(function (): void {
    Route::get('/services', [ServiceController::class, 'index']);

    // Client self-service endpoints (own profile only)
    Route::prefix('/client')->group(function (): void {
        Route::get('/profile', [ClientSelfController::class, 'showProfile']);
        Route::put('/profile', [ClientSelfController::class, 'updateProfile']);
    });

    // Administrative client lifecycle endpoints (enforced via ClientPolicy)
    Route::prefix('/clients')->group(function (): void {
        Route::get('/', [ClientController::class, 'index']);
        Route::post('/', [ClientController::class, 'store']);
        Route::get('/{client}', [ClientController::class, 'show']);
        Route::put('/{client}', [ClientController::class, 'update']);
        Route::put('/{client}/services', [ClientController::class, 'syncServices']);
        Route::put('/{client}/status', [ClientController::class, 'updateStatus']);
        Route::post('/{client}/invite', [ClientController::class, 'sendInvitation'])->middleware('throttle:5,1');
        Route::post('/{client}/resend-invitation', [ClientController::class, 'resendInvitation'])->middleware('throttle:5,1');
        Route::post('/{client}/revoke-access', [ClientController::class, 'revokeAccess']);
        Route::get('/{client}/activity', [ClientController::class, 'activity']);
        Route::get('/{client}/projects', [ClientController::class, 'projects']);
        Route::delete('/{client}', [ClientController::class, 'destroy']);
    });
});
