<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Message extends Model
{
    use HasFactory;

    public const SENDER_TYPES = ['admin', 'client'];

    protected $fillable = [
        'conversation_id',
        'sender_id',
        'sender_type',
        'body',
        'read_at',
        'read_by',
    ];

    protected $casts = [
        'conversation_id' => 'integer',
        'sender_id' => 'integer',
        'read_by' => 'integer',
        'read_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    protected $appends = [
        'is_read',
    ];

    public function conversation(): BelongsTo
    {
        return $this->belongsTo(Conversation::class);
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function reader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'read_by');
    }

    public function attachments(): BelongsToMany
    {
        return $this->belongsToMany(MediaFile::class, 'message_attachments', 'message_id', 'media_file_id')
            ->with('uploader:id,name');
    }

    public function getIsReadAttribute(): bool
    {
        return $this->read_at !== null;
    }
}
