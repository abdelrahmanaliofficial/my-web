<?php

use App\Http\Controllers\Api\ClientInvoiceController;
use App\Http\Controllers\Api\InvoiceController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'account.active'])->group(function (): void {
    // Client-scoped invoice endpoints (client derived solely from auth()->user())
    Route::prefix('/client/invoices')->group(function (): void {
        Route::get('/', [ClientInvoiceController::class, 'index']);
        Route::get('/{invoice}', [ClientInvoiceController::class, 'show']);
        Route::get('/{invoice}/payments', [ClientInvoiceController::class, 'payments']);
        Route::get('/{invoice}/pdf', [ClientInvoiceController::class, 'downloadPdf']);
    });

    // Minimal client/project picker for users authorized to create invoices.
    Route::get('/invoice-options', [InvoiceController::class, 'options']);

    // Administrative invoice management endpoints (enforced via InvoicePolicy)
    Route::prefix('/invoices')->group(function (): void {
        Route::get('/', [InvoiceController::class, 'index']);
        Route::post('/', [InvoiceController::class, 'store']);
        Route::get('/{invoice}', [InvoiceController::class, 'show']);
        Route::put('/{invoice}', [InvoiceController::class, 'update']);
        Route::post('/{invoice}/issue', [InvoiceController::class, 'issue']);
        Route::put('/{invoice}/status', [InvoiceController::class, 'updateStatus']);
        Route::post('/{invoice}/payments', [InvoiceController::class, 'recordPayment']);
        Route::get('/{invoice}/payments', [InvoiceController::class, 'payments']);
        Route::get('/{invoice}/pdf', [InvoiceController::class, 'downloadPdf']);
        Route::delete('/{invoice}', [InvoiceController::class, 'destroy']);
    });
});
