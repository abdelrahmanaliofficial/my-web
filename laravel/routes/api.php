<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\EmailVerificationController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\TeamController;
use Illuminate\Support\Facades\Route;

Route::get('/health', fn () => response()->json([
    'success' => true,
    'service' => 'laravel-api',
    'status' => 'ok',
]));

Route::middleware('throttle:auth')->post('/login', [AuthController::class, 'login']);
Route::middleware('throttle:auth')->post('/password/forgot', [AuthController::class, 'sendPasswordResetLink']);
Route::middleware('throttle:auth')->post('/password/reset', [AuthController::class, 'resetPassword']);
Route::get('/email/verify/{id}/{hash}', [EmailVerificationController::class, 'verify'])
    ->middleware(['signed', 'throttle:6,1'])
    ->name('verification.verify');

Route::get('/settings', [SettingsController::class, 'show']);
Route::get('/hero-media', [SettingsController::class, 'heroMedia']);

Route::middleware(['auth:sanctum', 'account.active'])->group(function (): void {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);
    Route::put('/me/password', [AuthController::class, 'updatePassword']);
    Route::post('/email/verification-notification', [EmailVerificationController::class, 'send'])
        ->middleware('throttle:6,1');

    Route::put('/settings', [SettingsController::class, 'update'])->middleware('permission:manage_settings');
    Route::post('/hero-media', [SettingsController::class, 'updateHeroMedia'])->middleware('permission:manage_settings');

    Route::prefix('/team')->group(function (): void {
        Route::get('/', [TeamController::class, 'index'])->middleware('permission:view_team');
        Route::get('/permission-catalog', [TeamController::class, 'permissionCatalog'])->middleware('permission:view_team');
        Route::get('/activity', [TeamController::class, 'activity'])->middleware('permission:view_team');
        Route::post('/invite', [TeamController::class, 'invite'])->middleware('permission:create_team');
        Route::post('/{user}/resend-invitation', [TeamController::class, 'resendInvitation'])->middleware('permission:update_team');
        Route::put('/{user}/permissions', [TeamController::class, 'updatePermissions'])->middleware('permission:manage_team');
        Route::put('/{user}/status', [TeamController::class, 'updateStatus'])->middleware('permission:update_team');
        Route::post('/{user}/revoke-sessions', [TeamController::class, 'revokeSessions'])->middleware('permission:update_team');
    });
});

require __DIR__ . '/clients_api.php';
require __DIR__ . '/projects_api.php';
require __DIR__ . '/billing_api.php';
require __DIR__ . '/media_api.php';
require __DIR__ . '/messages_api.php';
