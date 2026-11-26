<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\MorphTo;
use Illuminate\Support\Facades\Storage;

class MediaFile extends Model
{
    use HasFactory;

    public const PROJECT_CATEGORIES = [
        'contract',
        'requirement',
        'design',
        'report',
        'document',
        'deliverable',
        'attachment',
    ];

    protected $fillable = [
        'file_uid',
        'visibility',
        'category',
        'original_filename',
        'stored_filename',
        'disk',
        'storage_path',
        'mime_type',
        'extension',
        'file_size',
        'checksum_sha256',
        'owner_type',
        'owner_id',
        'client_id',
        'uploaded_by',
    ];

    protected $casts = [
        'file_size' => 'integer',
        'owner_id' => 'integer',
        'client_id' => 'integer',
        'uploaded_by' => 'integer',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /**
     * Storage internals and ownership keys remain server-side. Clients receive
     * only the metadata needed to display and download an authorized file.
     */
    protected $hidden = [
        'stored_filename',
        'disk',
        'storage_path',
        'checksum_sha256',
        'owner_type',
        'owner_id',
        'client_id',
        'uploaded_by',
    ];

    protected $appends = [
        'url',
    ];

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }

    public function client(): BelongsTo
    {
        return $this->belongsTo(Client::class, 'client_id');
    }

    public function owner(): MorphTo
    {
        return $this->morphTo();
    }

    public function isPublic(): bool
    {
        return $this->visibility === 'public';
    }

    public function isPrivate(): bool
    {
        return $this->visibility === 'private';
    }

    public function getUrlAttribute(): ?string
    {
        if ($this->isPublic()) {
            return Storage::disk($this->disk)->url($this->storage_path);
        }

        // Private files must never expose direct public storage URLs; use authorized download endpoint
        return url('/api/media/' . $this->file_uid . '/download');
    }
}
