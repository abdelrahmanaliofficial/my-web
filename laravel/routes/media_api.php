<?php

use App\Http\Controllers\Api\MediaFileController;
use Illuminate\Support\Facades\Route;

// Short-lived cryptographically signed download route (verified via hasValidSignature)
Route::get('/media/signed/{fileUid}', [MediaFileController::class, 'signedDownload'])
    ->name('media.signed-download');

Route::middleware(['auth:sanctum', 'account.active'])->prefix('/media')->group(function (): void {
    Route::get('/', [MediaFileController::class, 'index']);
    Route::post('/', [MediaFileController::class, 'store']);
    Route::get('/{fileUid}', [MediaFileController::class, 'show']);
    Route::get('/{fileUid}/download', [MediaFileController::class, 'download']);
    Route::post('/{fileUid}/signed-url', [MediaFileController::class, 'signedUrl']);
    Route::post('/{fileUid}/replace', [MediaFileController::class, 'replace']);
    Route::put('/{fileUid}', [MediaFileController::class, 'replace']);
    Route::delete('/{fileUid}', [MediaFileController::class, 'destroy']);
});
