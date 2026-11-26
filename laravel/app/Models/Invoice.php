<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Facades\DB;

class Invoice extends Model
{
    use HasFactory;

    public const STATUSES = [
        'draft',
        'issued',
        'partially_paid',
        'paid',
        'overdue',
        'cancelled',
    ];

    public const CURRENCIES = [
        'USD',
        'EUR',
        'GBP',
        'SAR',
        'AED',
        'EGP',
    ];

    public const MAX_AMOUNT_MINOR = 999_999_999_999; // DECIMAL(12, 2)

    protected $fillable = [
        'invoice_number',
        'client_id',
        'project_id',
        'created_by',
        'description',
        'amount',
        'paid_amount',
        'currency',
        'issue_date',
        'due_date',
        'status',
        'issued_at',
        'paid_at',
        'cancelled_at',
        'notes',
    ];

    protected $casts = [
        'amount' => 'float',
        'paid_amount' => 'float',
        'client_id' => 'integer',
        'project_id' => 'integer',
        'created_by' => 'integer',
        'issue_date' => 'date:Y-m-d',
        'due_date' => 'date:Y-m-d',
        'issued_at' => 'datetime',
        'paid_at' => 'datetime',
        'cancelled_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected $appends = [
        'balance_due',
    ];

    protected static function booted(): void
    {
        static::creating(function (Invoice $invoice): void {
            if (empty($invoice->invoice_number)) {
                $invoice->invoice_number = static::generateUniqueInvoiceNumber();
            }
            if (empty($invoice->currency)) {
                $invoice->currency = 'USD';
            }
            $invoice->currency = strtoupper((string) $invoice->currency);
        });
    }

    /**
     * Reserve a sequential invoice number under a database row lock.
     * The unique invoice_number index remains the final integrity safeguard.
     */
    public static function generateUniqueInvoiceNumber(): string
    {
        $year = (int) now()->format('Y');
        $prefix = "INV-{$year}-";

        return DB::transaction(function () use ($year, $prefix): string {
            $now = now();
            DB::table('invoice_number_sequences')->insertOrIgnore([
                'year' => $year,
                'next_number' => 1,
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $sequence = DB::table('invoice_number_sequences')
                ->where('year', $year)
                ->lockForUpdate()
                ->first();

            $nextNumber = max(1, (int) ($sequence?->next_number ?? 1));

            // Protect installations that already had invoices before this sequence table existed.
            $existingNumbers = static::query()
                ->where('invoice_number', 'like', $prefix . '%')
                ->pluck('invoice_number');
            $highestExisting = 0;
            foreach ($existingNumbers as $existingNumber) {
                if (is_string($existingNumber) && preg_match('/^' . preg_quote($prefix, '/') . '(\d{4,})$/', $existingNumber, $matches)) {
                    $highestExisting = max($highestExisting, (int) $matches[1]);
                }
            }
            $nextNumber = max($nextNumber, $highestExisting + 1);

            if ($nextNumber > 999_999_999) {
                throw new \RuntimeException('Invoice number sequence is exhausted for the current year.');
            }

            DB::table('invoice_number_sequences')
                ->where('year', $year)
                ->update([
                    'next_number' => $nextNumber + 1,
                    'updated_at' => $now,
                ]);

            return $prefix . str_pad((string) $nextNumber, 4, '0', STR_PAD_LEFT);
        }, 3);
    }

    public static function toMinorUnits(mixed $value): int
    {
        return (int) round(((float) $value) * 100, 0, PHP_ROUND_HALF_UP);
    }

    public static function fromMinorUnits(int $value): string
    {
        return number_format($value / 100, 2, '.', '');
    }

    public function getBalanceDueAttribute(): float
    {
        $totalMinor = self::toMinorUnits($this->amount);
        $paidMinor = self::toMinorUnits($this->paid_amount);

        return max(0, $totalMinor - $paidMinor) / 100;
    }

    public function recalculateFromRelations(): void
    {
        $itemsTotal = (string) $this->items()->sum('line_total');
        if ($this->items()->exists()) {
            $this->amount = self::fromMinorUnits(self::toMinorUnits($itemsTotal));
        }

        $paidTotal = (string) $this->payments()->sum('amount');
        $paidMinor = self::toMinorUnits($paidTotal);
        $amountMinor = self::toMinorUnits($this->amount);
        $this->paid_amount = self::fromMinorUnits($paidMinor);

        if (!in_array($this->status, ['cancelled', 'draft'], true)) {
            if ($amountMinor > 0 && $paidMinor >= $amountMinor) {
                $this->status = 'paid';
                $this->paid_at = $this->paid_at ?? now();
            } elseif ($paidMinor > 0) {
                $this->status = 'partially_paid';
                $this->paid_at = null;
            } elseif ($this->due_date !== null && $this->due_date->toDateString() < now()->toDateString()) {
                $this->status = 'overdue';
                $this->paid_at = null;
            } else {
                $this->status = 'issued';
                $this->paid_at = null;
            }
        }

        $this->save();
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function project(): BelongsTo
    {
        return $this->belongsTo(Project::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function items(): HasMany
    {
        return $this->hasMany(InvoiceItem::class)->orderBy('sort_order')->orderBy('id');
    }

    public function payments(): HasMany
    {
        return $this->hasMany(InvoicePayment::class)->orderByDesc('paid_at')->orderByDesc('id');
    }
}
