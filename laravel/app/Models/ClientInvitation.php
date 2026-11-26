<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ClientInvitation extends Model
{
    use HasFactory;

    protected $fillable = [
        'client_id',
        'user_id',
        'token_hash',
        'expires_at',
        'accepted_at',
        'revoked_at',
        'invited_by',
        'delivery_status',
        'delivery_accepted_at',
        'delivery_error',
    ];

    protected $hidden = [
        'token_hash',
        'delivery_error',
    ];

    protected $casts = [
        'expires_at' => 'datetime',
        'accepted_at' => 'datetime',
        'revoked_at' => 'datetime',
        'delivery_accepted_at' => 'datetime',
    ];

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function inviter(): BelongsTo
    {
        return $this->belongsTo(User::class, 'invited_by');
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }

    public function isUsable(): bool
    {
        return $this->accepted_at === null
            && $this->revoked_at === null
            && !$this->isExpired();
    }
}
