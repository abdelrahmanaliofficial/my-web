<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Conversation extends Model
{
    use HasFactory;

    public const STATUSES = ['open', 'archived'];

    protected $fillable = [
        'client_id',
        'project_id',
        'created_by',
        'subject',
        'status',
        'last_message_at',
        'archived_at',
        'archived_by',
    ];

    protected $casts = [
        'client_id' => 'integer',
        'project_id' => 'integer',
        'created_by' => 'integer',
        'archived_by' => 'integer',
        'last_message_at' => 'datetime',
        'archived_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

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

    public function archiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }

    public function messages(): HasMany
    {
        return $this->hasMany(Message::class)->orderBy('id');
    }

    public function latestMessage(): HasOne
    {
        return $this->hasOne(Message::class)->latestOfMany('id');
    }

    public function unreadCountFor(User $viewer): int
    {
        $targetSenderType = $viewer->role === 'client' ? 'admin' : 'client';

        return $this->messages()
            ->where('sender_type', $targetSenderType)
            ->whereNull('read_at')
            ->count();
    }
}
