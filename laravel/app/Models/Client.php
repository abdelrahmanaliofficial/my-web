<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Str;

class Client extends Model
{
    use HasFactory;

    protected $fillable = [
        'client_code',
        'user_id',
        'full_name',
        'email',
        'phone',
        'company_name',
        'address',
        'account_status',
        'invited_at',
        'activated_at',
        'suspended_at',
    ];

    protected $hidden = [
        // Account details are represented by safe, purpose-built attributes only.
        'user',
    ];

    protected $appends = [
        'account_setup_completed',
    ];

    protected $casts = [
        'invited_at' => 'datetime',
        'activated_at' => 'datetime',
        'suspended_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Client $client): void {
            if (empty($client->client_code)) {
                $client->client_code = static::generateUniqueCode();
            }
        });
    }

    public static function generateUniqueCode(): string
    {
        do {
            $code = 'CL-' . strtoupper(Str::random(6));
        } while (static::where('client_code', $code)->exists());

        return $code;
    }

    public function getAccountSetupCompletedAttribute(): bool
    {
        if ($this->relationLoaded('user')) {
            return $this->getRelation('user')?->email_verified_at !== null;
        }

        return $this->user()->whereNotNull('email_verified_at')->exists();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function services(): BelongsToMany
    {
        return $this->belongsToMany(Service::class, 'client_service')
            ->withPivot(['contract_status', 'assigned_at', 'notes'])
            ->withTimestamps();
    }

    public function projects(): HasMany
    {
        return $this->hasMany(Project::class)->orderByDesc('created_at');
    }

    public function invitations(): HasMany
    {
        return $this->hasMany(ClientInvitation::class)->orderByDesc('created_at');
    }

    public function latestInvitation(): HasOne
    {
        return $this->hasOne(ClientInvitation::class)->latestOfMany();
    }

    public function activityLogs(): HasMany
    {
        return $this->hasMany(ClientActivityLog::class)->orderByDesc('created_at');
    }

    public function conversations(): HasMany
    {
        return $this->hasMany(Conversation::class)->orderByDesc('last_message_at');
    }
}
