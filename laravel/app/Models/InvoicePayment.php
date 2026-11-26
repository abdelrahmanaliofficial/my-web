<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class InvoicePayment extends Model
{
    use HasFactory;

    public const METHODS = [
        'bank_transfer',
        'wire',
        'cash',
        'check',
        'other',
    ];

    protected $fillable = [
        'invoice_id',
        'client_id',
        'recorded_by',
        'payment_reference',
        'amount',
        'currency',
        'payment_method',
        'paid_at',
        'notes',
    ];

    protected $casts = [
        'invoice_id' => 'integer',
        'client_id' => 'integer',
        'recorded_by' => 'integer',
        'amount' => 'float',
        'paid_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (InvoicePayment $payment): void {
            if (empty($payment->payment_reference)) {
                $payment->payment_reference = 'PAY-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6));
            }
        });
    }

    public function invoice(): BelongsTo
    {
        return $this->belongsTo(Invoice::class);
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function recorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'recorded_by');
    }
}
