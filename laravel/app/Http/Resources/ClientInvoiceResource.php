<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ClientInvoiceResource extends JsonResource
{
    /**
     * Deliberately omits administrator-only invoice notes, creator IDs,
     * internal payment notes and staff recorder identities.
     *
     * @return array<string, mixed>
     */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'invoice_number' => $this->invoice_number,
            'description' => $this->description,
            'amount' => $this->amount,
            'paid_amount' => $this->paid_amount,
            'balance_due' => $this->balance_due,
            'currency' => $this->currency,
            'issue_date' => $this->issue_date?->toDateString(),
            'due_date' => $this->due_date?->toDateString(),
            'status' => $this->status,
            'issued_at' => $this->issued_at?->toISOString(),
            'paid_at' => $this->paid_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
            'project' => $this->whenLoaded('project', function (): ?array {
                if (!$this->project) {
                    return null;
                }

                return [
                    'id' => $this->project->id,
                    'project_code' => $this->project->project_code,
                    'name' => $this->project->name,
                ];
            }),
            'items' => $this->whenLoaded('items', fn () => $this->items->map(fn ($item): array => [
                'id' => $item->id,
                'invoice_id' => $item->invoice_id,
                'description' => $item->description,
                'quantity' => $item->quantity,
                'unit_price' => $item->unit_price,
                'line_total' => $item->line_total,
                'sort_order' => $item->sort_order,
            ])->values()),
            'payments' => $this->whenLoaded('payments', fn () => $this->payments->map(fn ($payment): array => [
                'id' => $payment->id,
                'invoice_id' => $payment->invoice_id,
                'payment_reference' => $payment->payment_reference,
                'amount' => $payment->amount,
                'currency' => $payment->currency,
                'payment_method' => $payment->payment_method,
                'paid_at' => $payment->paid_at?->toISOString(),
            ])->values()),
        ];
    }
}
