<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\ClientActivityLog;
use App\Models\Invoice;
use App\Models\InvoiceItem;
use App\Models\InvoicePayment;
use App\Models\Project;
use App\Services\InvoicePdfService;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\Response;

class InvoiceController extends Controller
{
    /** Minimal client/project choices needed by an administrator creating invoices. */
    public function options(): JsonResponse
    {
        $this->authorize('options', Invoice::class);

        $clients = Client::query()
            ->where('account_status', 'active')
            ->orderBy('full_name')
            ->get(['id', 'client_code', 'full_name', 'company_name', 'email']);

        $projects = Project::query()
            ->whereHas('client', fn (EloquentBuilder $query) => $query->where('account_status', 'active'))
            ->orderByDesc('created_at')
            ->get(['id', 'project_code', 'name', 'client_id']);

        return response()->json([
            'success' => true,
            'data' => [
                'clients' => $clients,
                'projects' => $projects,
            ],
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Invoice::class);

        $query = Invoice::query()->with([
            'client:id,client_code,full_name,company_name,email,account_status',
            'project:id,project_code,name,client_id',
            'creator:id,name,email',
            'items',
            'payments.recorder:id,name',
        ]);

        if ($status = $request->query('status')) {
            if (in_array($status, Invoice::STATUSES, true)) {
                $query->where('status', $status);
            }
        }

        if ($clientId = $request->integer('client_id')) {
            $query->where('client_id', $clientId);
        }

        if ($projectId = $request->integer('project_id')) {
            $query->where('project_id', $projectId);
        }

        if ($search = trim((string) $request->query('search', ''))) {
            $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search);
            $query->where(function ($q) use ($escaped): void {
                $q->where('invoice_number', 'like', "%{$escaped}%")
                    ->orWhere('description', 'like', "%{$escaped}%")
                    ->orWhereHas('client', fn ($clientQuery) => $clientQuery->where('full_name', 'like', "%{$escaped}%"));
            });
        }

        return response()->json([
            'success' => true,
            'data' => $query->orderByDesc('created_at')->orderByDesc('id')->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorize('create', Invoice::class);

        $validated = $request->validate([
            'client_id' => [
                'required',
                'integer',
                Rule::exists('clients', 'id')->where(fn ($query) => $query->where('account_status', 'active')),
            ],
            'project_id' => ['nullable', 'integer', Rule::exists('projects', 'id')],
            'description' => ['nullable', 'string', 'max:3000'],
            'currency' => ['required', 'string', Rule::in(Invoice::CURRENCIES)],
            'issue_date' => ['nullable', 'date'],
            'due_date' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'issue_immediately' => ['sometimes', 'boolean'],
            'amount' => ['nullable', 'numeric', 'min:0.01', 'max:9999999999.99'],
            'items' => ['nullable', 'array', 'max:100'],
            'items.*.description' => ['required_with:items', 'string', 'max:255'],
            'items.*.quantity' => ['required_with:items', 'numeric', 'min:0.01', 'max:100000'],
            'items.*.unit_price' => ['required_with:items', 'numeric', 'min:0', 'max:9999999999.99'],
        ]);

        $this->validateInvoiceDates($validated, null);
        $this->assertProjectBelongsToClient($validated['project_id'] ?? null, (int) $validated['client_id']);

        $itemsInput = $validated['items'] ?? [];
        $computedAmount = $this->computeAuthoritativeAmount($itemsInput, $validated['amount'] ?? null);
        $issueImmediately = (bool) ($validated['issue_immediately'] ?? false);
        $actor = $request->user();
        $issueDate = $validated['issue_date'] ?? now()->toDateString();
        $dueDate = $validated['due_date'] ?? null;
        $initialStatus = 'draft';
        if ($issueImmediately) {
            $initialStatus = $dueDate !== null && $dueDate < now()->toDateString() ? 'overdue' : 'issued';
        }

        $invoice = DB::transaction(function () use ($validated, $itemsInput, $computedAmount, $issueImmediately, $initialStatus, $issueDate, $dueDate, $actor): Invoice {
            $invoice = Invoice::create([
                'client_id' => (int) $validated['client_id'],
                'project_id' => !empty($validated['project_id']) ? (int) $validated['project_id'] : null,
                'created_by' => $actor->id,
                'description' => $validated['description'] ?? null,
                'amount' => $computedAmount,
                'paid_amount' => '0.00',
                'currency' => strtoupper($validated['currency']),
                'issue_date' => $issueDate,
                'due_date' => $dueDate,
                'status' => $initialStatus,
                'issued_at' => $issueImmediately ? now() : null,
                'notes' => $validated['notes'] ?? null,
            ]);

            $this->replaceInvoiceItems($invoice, $itemsInput);

            ClientActivityLog::create([
                'client_id' => $invoice->client_id,
                'actor_id' => $actor->id,
                'action' => $issueImmediately ? 'invoice_issued' : 'invoice_created',
                'description' => ($issueImmediately ? 'Issued' : 'Created draft') . " invoice {$invoice->invoice_number} ({$invoice->amount} {$invoice->currency}).",
                'created_at' => now(),
            ]);

            return $invoice;
        }, 3);

        return response()->json([
            'success' => true,
            'message' => 'Invoice created successfully.',
            'data' => $this->loadFullInvoice($invoice),
        ], 201);
    }

    public function show(Invoice $invoice): JsonResponse
    {
        $this->authorize('view', $invoice);

        return response()->json([
            'success' => true,
            'data' => $this->loadFullInvoice($invoice),
        ]);
    }

    public function update(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorize('update', $invoice);

        $validated = $request->validate([
            'client_id' => [
                'sometimes',
                'integer',
                Rule::exists('clients', 'id')->where(fn ($query) => $query->where('account_status', 'active')),
            ],
            'project_id' => ['sometimes', 'nullable', 'integer', Rule::exists('projects', 'id')],
            'description' => ['sometimes', 'nullable', 'string', 'max:3000'],
            'currency' => ['sometimes', 'string', Rule::in(Invoice::CURRENCIES)],
            'issue_date' => ['sometimes', 'nullable', 'date'],
            'due_date' => ['sometimes', 'nullable', 'date'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:2000'],
            'amount' => ['sometimes', 'numeric', 'min:0.01', 'max:9999999999.99'],
            'items' => ['sometimes', 'nullable', 'array', 'max:100'],
            'items.*.description' => ['required_with:items', 'string', 'max:255'],
            'items.*.quantity' => ['required_with:items', 'numeric', 'min:0.01', 'max:100000'],
            'items.*.unit_price' => ['required_with:items', 'numeric', 'min:0', 'max:9999999999.99'],
        ]);

        $updatedInvoice = DB::transaction(function () use ($invoice, $validated): Invoice {
            // Lock the draft so a simultaneous issue/payment operation cannot race an edit.
            $lockedInvoice = Invoice::query()->whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $this->authorize('update', $lockedInvoice);

            if ($lockedInvoice->status !== 'draft') {
                throw ValidationException::withMessages([
                    'invoice' => ['Only draft invoices can be edited. Issued invoices are immutable.'],
                ]);
            }

            $targetClientId = (int) ($validated['client_id'] ?? $lockedInvoice->client_id);
            $clientIsActive = Client::query()
                ->whereKey($targetClientId)
                ->where('account_status', 'active')
                ->exists();
            if (!$clientIsActive) {
                throw ValidationException::withMessages([
                    'client_id' => ['Invoices can only be assigned to an active client account.'],
                ]);
            }

            $targetProjectId = array_key_exists('project_id', $validated)
                ? ($validated['project_id'] ? (int) $validated['project_id'] : null)
                : $lockedInvoice->project_id;
            $this->assertProjectBelongsToClient($targetProjectId, $targetClientId);
            $this->validateInvoiceDates($validated, $lockedInvoice);

            if (array_key_exists('amount', $validated) && !array_key_exists('items', $validated) && $lockedInvoice->items()->exists()) {
                throw ValidationException::withMessages([
                    'amount' => ['Update line items when changing the total of an itemized invoice.'],
                ]);
            }

            if (array_key_exists('items', $validated)) {
                $itemsInput = $validated['items'] ?? [];
                $computedAmount = $this->computeAuthoritativeAmount($itemsInput, $validated['amount'] ?? null);
                $this->replaceInvoiceItems($lockedInvoice, $itemsInput);
                $lockedInvoice->amount = $computedAmount;
            } elseif (array_key_exists('amount', $validated)) {
                $lockedInvoice->amount = Invoice::fromMinorUnits(Invoice::toMinorUnits($validated['amount']));
            }

            $lockedInvoice->client_id = $targetClientId;
            $lockedInvoice->project_id = $targetProjectId;
            foreach (['description', 'currency', 'issue_date', 'due_date', 'notes'] as $field) {
                if (array_key_exists($field, $validated)) {
                    $lockedInvoice->{$field} = $field === 'currency'
                        ? strtoupper((string) $validated[$field])
                        : $validated[$field];
                }
            }
            $lockedInvoice->save();

            return $lockedInvoice;
        }, 3);

        return response()->json([
            'success' => true,
            'message' => 'Draft invoice updated.',
            'data' => $this->loadFullInvoice($updatedInvoice),
        ]);
    }

    public function issue(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorize('issue', $invoice);

        $issuedInvoice = DB::transaction(function () use ($invoice, $request): Invoice {
            $lockedInvoice = Invoice::query()->whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $this->authorize('issue', $lockedInvoice);

            if ($lockedInvoice->status !== 'draft') {
                throw ValidationException::withMessages([
                    'status' => ['Only draft invoices can be issued.'],
                ]);
            }

            if (Invoice::toMinorUnits($lockedInvoice->amount) <= 0) {
                throw ValidationException::withMessages([
                    'amount' => ['Invoice total amount must be greater than zero before issuing.'],
                ]);
            }

            $lockedInvoice->status = $lockedInvoice->due_date !== null
                && $lockedInvoice->due_date->toDateString() < now()->toDateString()
                    ? 'overdue'
                    : 'issued';
            $lockedInvoice->issued_at = now();
            if ($lockedInvoice->issue_date === null) {
                $lockedInvoice->issue_date = now()->toDateString();
            }
            $lockedInvoice->save();

            ClientActivityLog::create([
                'client_id' => $lockedInvoice->client_id,
                'actor_id' => $request->user()->id,
                'action' => 'invoice_issued',
                'description' => "Issued invoice {$lockedInvoice->invoice_number} ({$lockedInvoice->amount} {$lockedInvoice->currency}).",
                'created_at' => now(),
            ]);

            return $lockedInvoice;
        }, 3);

        return response()->json([
            'success' => true,
            'message' => 'Invoice issued successfully.',
            'data' => $this->loadFullInvoice($issuedInvoice),
        ]);
    }

    public function updateStatus(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorize('update', $invoice);

        $validated = $request->validate([
            'status' => ['required', Rule::in(['issued', 'overdue', 'cancelled'])],
        ]);
        $targetStatus = $validated['status'];
        $actor = $request->user();

        $updatedInvoice = DB::transaction(function () use ($invoice, $targetStatus, $actor): Invoice {
            $lockedInvoice = Invoice::query()->whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $this->authorize('update', $lockedInvoice);

            $paidMinor = Invoice::toMinorUnits($lockedInvoice->payments()->sum('amount'));
            $dueDate = $lockedInvoice->due_date?->toDateString();
            $today = now()->toDateString();

            if ($targetStatus === 'overdue') {
                if ($lockedInvoice->status !== 'issued' || !$dueDate || $dueDate >= $today || $paidMinor > 0) {
                    throw ValidationException::withMessages([
                        'status' => ['An invoice can be marked overdue only after its due date when no payment has been recorded.'],
                    ]);
                }
            } elseif ($targetStatus === 'issued') {
                if ($lockedInvoice->status !== 'overdue' || ($dueDate !== null && $dueDate < $today) || $paidMinor > 0) {
                    throw ValidationException::withMessages([
                        'status' => ['Only an unpaid overdue invoice with a current or future due date can return to issued status.'],
                    ]);
                }
            } elseif ($targetStatus === 'cancelled') {
                if (!in_array($lockedInvoice->status, ['draft', 'issued', 'overdue'], true) || $paidMinor > 0) {
                    throw ValidationException::withMessages([
                        'status' => ['Invoices with recorded payments or closed states cannot be cancelled.'],
                    ]);
                }
            }

            $lockedInvoice->status = $targetStatus;
            $lockedInvoice->cancelled_at = $targetStatus === 'cancelled' ? now() : null;
            $lockedInvoice->paid_at = null;
            $lockedInvoice->save();

            ClientActivityLog::create([
                'client_id' => $lockedInvoice->client_id,
                'actor_id' => $actor->id,
                'action' => 'invoice_status_updated',
                'description' => "Updated {$lockedInvoice->invoice_number} status to {$targetStatus}.",
                'created_at' => now(),
            ]);

            return $lockedInvoice;
        }, 3);

        return response()->json([
            'success' => true,
            'message' => 'Invoice status updated.',
            'data' => $this->loadFullInvoice($updatedInvoice),
        ]);
    }

    public function recordPayment(Request $request, Invoice $invoice): JsonResponse
    {
        $this->authorize('recordPayment', $invoice);

        $validated = $request->validate([
            'amount' => ['required', 'numeric', 'min:0.01', 'max:9999999999.99'],
            'payment_method' => ['required', Rule::in(InvoicePayment::METHODS)],
            'paid_at' => ['nullable', 'date'],
            'notes' => ['nullable', 'string', 'max:500'],
            'card_number' => ['prohibited'],
            'cardNumber' => ['prohibited'],
            'card_cvv' => ['prohibited'],
            'card_expiry' => ['prohibited'],
            'card_expiration' => ['prohibited'],
            'expiration_date' => ['prohibited'],
            'security_code' => ['prohibited'],
            'cvv' => ['prohibited'],
            'cvc' => ['prohibited'],
            'expiry' => ['prohibited'],
            'expiration' => ['prohibited'],
            'pan' => ['prohibited'],
        ]);

        $paymentMinor = Invoice::toMinorUnits($validated['amount']);
        $actor = $request->user();

        $updatedInvoice = DB::transaction(function () use ($invoice, $validated, $paymentMinor, $actor): Invoice {
            // Serialize concurrent payment attempts so two requests cannot overpay the same invoice.
            $lockedInvoice = Invoice::query()->whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            $this->authorize('recordPayment', $lockedInvoice);

            if (in_array($lockedInvoice->status, ['draft', 'cancelled', 'paid'], true)) {
                throw ValidationException::withMessages([
                    'status' => ["Cannot record payments for an invoice in '{$lockedInvoice->status}' status."],
                ]);
            }

            $paidSoFarMinor = Invoice::toMinorUnits($lockedInvoice->payments()->sum('amount'));
            $balanceMinor = max(0, Invoice::toMinorUnits($lockedInvoice->amount) - $paidSoFarMinor);
            if ($paymentMinor <= 0 || $paymentMinor > $balanceMinor) {
                throw ValidationException::withMessages([
                    'amount' => [
                        'Payment exceeds the remaining balance of ' . Invoice::fromMinorUnits($balanceMinor) . ' ' . $lockedInvoice->currency . '.',
                    ],
                ]);
            }

            InvoicePayment::create([
                'invoice_id' => $lockedInvoice->id,
                'client_id' => $lockedInvoice->client_id,
                'recorded_by' => $actor->id,
                'amount' => Invoice::fromMinorUnits($paymentMinor),
                'currency' => $lockedInvoice->currency,
                'payment_method' => $validated['payment_method'],
                'paid_at' => $validated['paid_at'] ?? now(),
                'notes' => $validated['notes'] ?? null,
            ]);

            $lockedInvoice->recalculateFromRelations();

            ClientActivityLog::create([
                'client_id' => $lockedInvoice->client_id,
                'actor_id' => $actor->id,
                'action' => 'invoice_payment_recorded',
                'description' => 'Recorded payment of ' . Invoice::fromMinorUnits($paymentMinor) . " {$lockedInvoice->currency} for {$lockedInvoice->invoice_number}.",
                'created_at' => now(),
            ]);

            return $lockedInvoice;
        }, 3);

        return response()->json([
            'success' => true,
            'message' => 'Payment recorded.',
            'data' => $this->loadFullInvoice($updatedInvoice),
        ], 201);
    }

    public function payments(Invoice $invoice): JsonResponse
    {
        $this->authorize('view', $invoice);

        return response()->json([
            'success' => true,
            'data' => $invoice->payments()->with('recorder:id,name')->get(),
        ]);
    }

    public function downloadPdf(Invoice $invoice, InvoicePdfService $pdfService): Response
    {
        $this->authorize('downloadPdf', $invoice);
        return $pdfService->downloadResponse($invoice);
    }

    public function destroy(Invoice $invoice): JsonResponse
    {
        $this->authorize('delete', $invoice);

        if (!in_array($invoice->status, ['draft', 'cancelled'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'Only draft or cancelled invoices can be deleted.',
            ], 422);
        }

        if ($invoice->payments()->exists()) {
            return response()->json([
                'success' => false,
                'message' => 'An invoice with payment history cannot be deleted. Keep it for accounting records.',
            ], 422);
        }

        DB::transaction(function () use ($invoice): void {
            $lockedInvoice = Invoice::query()->whereKey($invoice->id)->lockForUpdate()->firstOrFail();
            if ($lockedInvoice->payments()->exists()) {
                throw ValidationException::withMessages([
                    'invoice' => ['An invoice with payment history cannot be deleted.'],
                ]);
            }
            if (!in_array($lockedInvoice->status, ['draft', 'cancelled'], true)) {
                throw ValidationException::withMessages([
                    'invoice' => ['Only draft or cancelled invoices can be deleted.'],
                ]);
            }
            $lockedInvoice->delete();
        }, 3);

        return response()->json([
            'success' => true,
            'message' => 'Invoice deleted.',
        ]);
    }

    /** @param array<int, array<string, mixed>> $items */
    private function computeAuthoritativeAmount(array $items, mixed $fallbackAmount): string
    {
        if (!empty($items)) {
            $totalMinor = 0;
            foreach ($items as $item) {
                $quantity = round((float) $item['quantity'], 2, PHP_ROUND_HALF_UP);
                $unitPriceMinor = Invoice::toMinorUnits($item['unit_price']);
                $lineTotalMinor = (int) round($quantity * $unitPriceMinor, 0, PHP_ROUND_HALF_UP);
                $totalMinor += $lineTotalMinor;
                if ($totalMinor > Invoice::MAX_AMOUNT_MINOR) {
                    throw ValidationException::withMessages([
                        'items' => ['The invoice total exceeds the maximum supported amount.'],
                    ]);
                }
            }

            if ($totalMinor <= 0) {
                throw ValidationException::withMessages([
                    'items' => ['Line items total must be greater than zero.'],
                ]);
            }

            return Invoice::fromMinorUnits($totalMinor);
        }

        if ($fallbackAmount === null) {
            throw ValidationException::withMessages([
                'amount' => ['Invoice amount is required when no line items are provided.'],
            ]);
        }

        $fallbackMinor = Invoice::toMinorUnits($fallbackAmount);
        if ($fallbackMinor <= 0 || $fallbackMinor > Invoice::MAX_AMOUNT_MINOR) {
            throw ValidationException::withMessages([
                'amount' => ['Invoice amount must be greater than zero and within the supported maximum.'],
            ]);
        }

        return Invoice::fromMinorUnits($fallbackMinor);
    }

    /** @param array<int, array<string, mixed>> $items */
    private function replaceInvoiceItems(Invoice $invoice, array $items): void
    {
        $invoice->items()->delete();

        foreach (array_values($items) as $index => $item) {
            $quantity = round((float) $item['quantity'], 2, PHP_ROUND_HALF_UP);
            $unitPriceMinor = Invoice::toMinorUnits($item['unit_price']);
            $lineTotalMinor = (int) round($quantity * $unitPriceMinor, 0, PHP_ROUND_HALF_UP);

            InvoiceItem::create([
                'invoice_id' => $invoice->id,
                'description' => trim((string) $item['description']),
                'quantity' => number_format($quantity, 2, '.', ''),
                'unit_price' => Invoice::fromMinorUnits($unitPriceMinor),
                'line_total' => Invoice::fromMinorUnits($lineTotalMinor),
                'sort_order' => $index + 1,
            ]);
        }
    }

    private function assertProjectBelongsToClient(mixed $projectId, int $clientId): void
    {
        if (!$projectId) {
            return;
        }

        $project = Project::query()->findOrFail((int) $projectId);
        if ((int) $project->client_id !== $clientId) {
            throw ValidationException::withMessages([
                'project_id' => ['Selected project does not belong to the specified client.'],
            ]);
        }
    }

    /** @param array<string, mixed> $validated */
    private function validateInvoiceDates(array $validated, ?Invoice $invoice): void
    {
        $issueDate = $validated['issue_date'] ?? $invoice?->issue_date?->toDateString() ?? now()->toDateString();
        $dueDate = array_key_exists('due_date', $validated)
            ? $validated['due_date']
            : $invoice?->due_date?->toDateString();

        if ($dueDate !== null && $issueDate !== null && $dueDate < $issueDate) {
            throw ValidationException::withMessages([
                'due_date' => ['The due date must be on or after the issue date.'],
            ]);
        }
    }

    private function loadFullInvoice(Invoice $invoice): Invoice
    {
        return $invoice->fresh([
            'client:id,client_code,full_name,company_name,email,account_status',
            'project:id,project_code,name,client_id',
            'creator:id,name,email',
            'items',
            'payments.recorder:id,name',
        ]);
    }
}
