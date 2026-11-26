<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\ClientInvoiceResource;
use App\Models\Client;
use App\Models\Invoice;
use App\Services\InvoicePdfService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ClientInvoiceController extends Controller
{
    private function resolveAuthenticatedClient(Request $request): ?Client
    {
        $user = $request->user();
        if (!$user || !$user->isActive() || !$user->hasRole('client')) {
            return null;
        }

        return Client::query()
            ->where('user_id', $user->id)
            ->where('account_status', 'active')
            ->first();
    }

    public function index(Request $request): JsonResponse
    {
        // Ownership always comes from the authenticated Sanctum session.
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $query = Invoice::query()
            ->where('client_id', $client->id)
            ->where('status', '!=', 'draft')
            ->with([
                'project:id,project_code,name',
                'items',
                'payments:id,invoice_id,payment_reference,amount,currency,payment_method,paid_at',
            ])
            ->orderByDesc('created_at')
            ->orderByDesc('id');

        if ($status = $request->query('status')) {
            if ($status !== 'draft' && in_array($status, Invoice::STATUSES, true)) {
                $query->where('status', $status);
            }
        }

        $data = $query->get()->map(
            fn (Invoice $invoice): array => (new ClientInvoiceResource($invoice))->resolve($request)
        )->values();

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function show(Request $request, Invoice $invoice): JsonResponse
    {
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $this->authorize('viewForClient', $invoice);
        abort_unless((int) $invoice->client_id === (int) $client->id, 403, 'Forbidden.');

        $invoice->load([
            'project:id,project_code,name',
            'items',
            'payments:id,invoice_id,payment_reference,amount,currency,payment_method,paid_at',
        ]);

        return response()->json([
            'success' => true,
            'data' => (new ClientInvoiceResource($invoice))->resolve($request),
        ]);
    }

    public function payments(Request $request, Invoice $invoice): JsonResponse
    {
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            return response()->json(['success' => false, 'message' => 'Forbidden.'], 403);
        }

        $this->authorize('viewForClient', $invoice);
        abort_unless((int) $invoice->client_id === (int) $client->id, 403, 'Forbidden.');

        $payments = $invoice->payments()
            ->select(['id', 'invoice_id', 'payment_reference', 'amount', 'currency', 'payment_method', 'paid_at'])
            ->get()
            ->map(fn ($payment): array => [
                'id' => $payment->id,
                'invoice_id' => $payment->invoice_id,
                'payment_reference' => $payment->payment_reference,
                'amount' => $payment->amount,
                'currency' => $payment->currency,
                'payment_method' => $payment->payment_method,
                'paid_at' => $payment->paid_at?->toISOString(),
            ]);

        return response()->json([
            'success' => true,
            'data' => $payments,
        ]);
    }

    public function downloadPdf(Request $request, Invoice $invoice, InvoicePdfService $pdfService): Response
    {
        $client = $this->resolveAuthenticatedClient($request);
        if (!$client) {
            abort(403, 'Forbidden.');
        }

        $this->authorize('viewForClient', $invoice);
        abort_unless((int) $invoice->client_id === (int) $client->id, 403, 'Forbidden.');

        return $pdfService->downloadResponse($invoice);
    }
}
