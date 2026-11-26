<?php

namespace App\Services;

use App\Models\Client;
use App\Models\MediaFile;
use App\Models\Project;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

class PersistentStorageService
{
    public const BLOCKED_EXTENSIONS = [
        'php', 'phtml', 'phar', 'php3', 'php4', 'php5', 'php7', 'php8',
        'exe', 'dll', 'msi', 'com', 'bat', 'cmd', 'sh', 'bash', 'zsh', 'ps1',
        'js', 'mjs', 'cjs', 'vbs', 'wsf', 'hta', 'html', 'htm', 'svg', 'svgz',
        'pl', 'py', 'rb', 'cgi', 'asp', 'aspx', 'jsp', 'htaccess', 'env',
    ];

    public const PUBLIC_ALLOWED_MIMES = [
        'image/png' => ['png'],
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/webp' => ['webp'],
        'video/mp4' => ['mp4'],
        'video/webm' => ['webm'],
    ];

    public const PRIVATE_ALLOWED_MIMES = [
        'application/pdf' => ['pdf'],
        'image/png' => ['png'],
        'image/jpeg' => ['jpg', 'jpeg'],
        'image/webp' => ['webp'],
        'text/plain' => ['txt', 'csv'],
        'text/csv' => ['csv'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['docx'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['xlsx'],
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => ['pptx'],
        'application/zip' => ['zip'],
    ];

    public const MAX_BYTES_PUBLIC_IMAGE = 5 * 1024 * 1024;      // 5 MB
    public const MAX_BYTES_PUBLIC_VIDEO = 25 * 1024 * 1024;     // 25 MB
    public const MAX_BYTES_PRIVATE_DOCUMENT = 15 * 1024 * 1024; // 15 MB

    public function resolveDisk(string $visibility): string
    {
        if ($visibility === 'public') {
            return (string) config('filesystems.public_media_disk', 'public');
        }

        return (string) config('filesystems.private_media_disk', 'local');
    }

    public function storeUpload(
        UploadedFile $file,
        User $actor,
        string $visibility,
        string $category,
        ?string $ownerType = null,
        ?int $ownerId = null
    ): MediaFile {
        if (!in_array($visibility, ['public', 'private'], true)) {
            throw ValidationException::withMessages(['visibility' => ['Invalid visibility scope.']]);
        }

        $validatedMeta = $this->validateUploadedFile($file, $visibility, $category);
        [$resolvedOwnerType, $resolvedOwnerId, $resolvedClientId] = $this->verifyAndResolveOwner(
            $actor,
            $visibility,
            $ownerType,
            $ownerId
        );

        $disk = $this->resolveDisk($visibility);
        $fileUid = (string) Str::uuid();
        $storedFilename = $fileUid . '.' . $validatedMeta['extension'];
        $directory = $this->buildDirectory($visibility, $validatedMeta['category'], $resolvedOwnerId);
        $storagePath = $this->assertSafeRelativePath($directory . '/' . $storedFilename);

        $realTmpPath = $file->getRealPath();
        $checksum = $realTmpPath && is_file($realTmpPath) ? hash_file('sha256', $realTmpPath) : null;

        $diskStore = Storage::disk($disk);
        $written = $diskStore->putFileAs(
            $directory,
            $file,
            $storedFilename,
            ['visibility' => $visibility === 'public' ? 'public' : 'private']
        );

        if (!$written || !$diskStore->exists($storagePath)) {
            if ($diskStore->exists($storagePath)) {
                $diskStore->delete($storagePath);
            }
            throw new \RuntimeException('File storage could not be verified after upload.');
        }

        try {
            DB::transaction(function () use (
                $fileUid,
                $visibility,
                $validatedMeta,
                $storedFilename,
                $disk,
                $storagePath,
                $checksum,
                $resolvedOwnerType,
                $resolvedOwnerId,
                $resolvedClientId,
                $actor
            ): MediaFile {
                return MediaFile::create([
                    'file_uid' => $fileUid,
                    'visibility' => $visibility,
                    'category' => $validatedMeta['category'],
                    'original_filename' => $validatedMeta['original_filename'],
                    'stored_filename' => $storedFilename,
                    'disk' => $disk,
                    'storage_path' => $storagePath,
                    'mime_type' => $validatedMeta['mime_type'],
                    'extension' => $validatedMeta['extension'],
                    'file_size' => $validatedMeta['file_size'],
                    'checksum_sha256' => $checksum,
                    'owner_type' => $resolvedOwnerType,
                    'owner_id' => $resolvedOwnerId,
                    'client_id' => $resolvedClientId,
                    'uploaded_by' => $actor->id,
                ]);
            });

            // Re-read the database record and check the object on the configured disk.
            // A successful HTTP upload is returned only after both sides are confirmed.
            $confirmed = MediaFile::with('uploader:id,name')
                ->where('file_uid', $fileUid)
                ->first();

            if (
                !$confirmed
                || !$diskStore->exists($confirmed->storage_path)
                || (int) $confirmed->file_size !== (int) $validatedMeta['file_size']
                || $confirmed->mime_type !== $validatedMeta['mime_type']
            ) {
                throw new \RuntimeException('Uploaded file metadata or stored object could not be confirmed.');
            }

            return $confirmed;
        } catch (\Throwable $e) {
            MediaFile::where('file_uid', $fileUid)->delete();
            $diskStore->delete($storagePath);
            throw $e;
        }
    }

    public function replaceUpload(
        MediaFile $existing,
        UploadedFile $newFile,
        User $actor,
        ?string $category = null
    ): MediaFile {
        $targetCategory = $category !== null && trim($category) !== '' ? $category : $existing->category;
        $validatedMeta = $this->validateUploadedFile($newFile, $existing->visibility, $targetCategory);
        $disk = $this->resolveDisk($existing->visibility);

        $newUid = (string) Str::uuid();
        $newStoredFilename = $newUid . '.' . $validatedMeta['extension'];
        $directory = $this->buildDirectory($existing->visibility, $validatedMeta['category'], $existing->owner_id);
        $newStoragePath = $this->assertSafeRelativePath($directory . '/' . $newStoredFilename);

        $realTmpPath = $newFile->getRealPath();
        $checksum = $realTmpPath && is_file($realTmpPath) ? hash_file('sha256', $realTmpPath) : null;

        $diskStore = Storage::disk($disk);
        $written = $diskStore->putFileAs(
            $directory,
            $newFile,
            $newStoredFilename,
            ['visibility' => $existing->isPublic() ? 'public' : 'private']
        );

        if (!$written || !$diskStore->exists($newStoragePath)) {
            if ($diskStore->exists($newStoragePath)) {
                $diskStore->delete($newStoragePath);
            }
            throw new \RuntimeException('Replacement file storage could not be verified.');
        }

        $oldDisk = $existing->disk;
        $oldPath = $existing->storage_path;
        $oldMetadata = $existing->only([
            'category', 'original_filename', 'stored_filename', 'disk', 'storage_path',
            'mime_type', 'extension', 'file_size', 'checksum_sha256', 'uploaded_by',
        ]);

        try {
            DB::transaction(function () use (
                $existing,
                $validatedMeta,
                $newStoredFilename,
                $disk,
                $newStoragePath,
                $checksum,
                $actor
            ): void {
                $existing->update([
                    'category' => $validatedMeta['category'],
                    'original_filename' => $validatedMeta['original_filename'],
                    'stored_filename' => $newStoredFilename,
                    'disk' => $disk,
                    'storage_path' => $newStoragePath,
                    'mime_type' => $validatedMeta['mime_type'],
                    'extension' => $validatedMeta['extension'],
                    'file_size' => $validatedMeta['file_size'],
                    'checksum_sha256' => $checksum,
                    'uploaded_by' => $actor->id,
                ]);
            });

            $confirmed = $existing->fresh(['uploader:id,name']);
            if (
                !$confirmed
                || !$diskStore->exists($confirmed->storage_path)
                || (int) $confirmed->file_size !== (int) $validatedMeta['file_size']
                || $confirmed->mime_type !== $validatedMeta['mime_type']
            ) {
                throw new \RuntimeException('Replacement metadata and stored object could not be confirmed.');
            }
        } catch (\Throwable $e) {
            // Restore the previous metadata if the replacement could not be verified.
            try {
                $existing->update($oldMetadata);
            } catch (\Throwable) {
                // Preserve the original exception; the report will expose the cleanup issue.
            }
            $diskStore->delete($newStoragePath);
            throw $e;
        }

        if ($oldPath !== $newStoragePath || $oldDisk !== $disk) {
            $oldStore = Storage::disk($oldDisk);
            if ($oldStore->exists($oldPath) && !$oldStore->delete($oldPath) && $oldStore->exists($oldPath)) {
                // The replacement is already authoritative; record cleanup failure for operators.
                report(new \RuntimeException('The replaced file remains as an orphaned storage object: ' . $oldPath));
            }
        }

        return $confirmed;
    }

    public function deleteFile(MediaFile $file): void
    {
        $disk = $file->disk;
        $path = $this->assertSafeRelativePath($file->storage_path);
        $diskStore = Storage::disk($disk);

        DB::transaction(function () use ($file, $path, $diskStore): void {
            // Remove the object first, then its metadata. If object deletion fails,
            // the transaction leaves the metadata row available for a safe retry.
            if ($diskStore->exists($path)) {
                $deleted = $diskStore->delete($path);
                if (!$deleted || $diskStore->exists($path)) {
                    throw new \RuntimeException('Stored file could not be deleted; metadata was preserved.');
                }
            }

            if (!$file->delete()) {
                throw new \RuntimeException('File metadata could not be deleted.');
            }
        });

        if (MediaFile::whereKey($file->getKey())->exists() || $diskStore->exists($path)) {
            throw new \RuntimeException('File deletion could not be confirmed in both storage and database.');
        }
    }

    public function streamFile(MediaFile $file, bool $asAttachment = true): StreamedResponse
    {
        $safePath = $this->assertSafeRelativePath($file->storage_path);
        abort_unless(Storage::disk($file->disk)->exists($safePath), 404, 'Stored file could not be found.');

        $disposition = ($asAttachment ? 'attachment' : 'inline')
            . '; filename="' . addcslashes($file->original_filename, '"\\') . '"';

        return Storage::disk($file->disk)->response($safePath, $file->original_filename, [
            'Content-Type' => $file->mime_type,
            'Content-Disposition' => $disposition,
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => $file->isPrivate() ? 'private, no-store, max-age=0' : 'public, max-age=86400',
        ]);
    }

    public function createSignedDownloadUrl(MediaFile $file, int $ttlMinutes = 5): string
    {
        $diskInstance = Storage::disk($file->disk);
        if (method_exists($diskInstance, 'providesTemporaryUrls') && $diskInstance->providesTemporaryUrls()) {
            return $diskInstance->temporaryUrl($file->storage_path, now()->addMinutes($ttlMinutes), [
                'ResponseContentDisposition' => 'attachment; filename="' . addcslashes($file->original_filename, '"\\') . '"',
            ]);
        }

        return URL::temporarySignedRoute(
            'media.signed-download',
            now()->addMinutes($ttlMinutes),
            ['fileUid' => $file->file_uid]
        );
    }

    public function validateUploadedFile(UploadedFile $file, string $visibility, string $category): array
    {
        if (!$file->isValid()) {
            throw ValidationException::withMessages(['file' => ['Uploaded file failed integrity checks.']]);
        }

        $rawName = str_replace("\0", '', (string) $file->getClientOriginalName());
        $baseName = basename(str_replace('\\', '/', $rawName));
        // Strip control characters so uploaded filenames cannot inject response headers.
        $baseName = preg_replace('/[\x00-\x1F\x7F]/u', '', $baseName) ?? '';
        $baseName = trim($baseName);
        if ($baseName === '' || str_contains($baseName, '..')) {
            throw ValidationException::withMessages(['file' => ['Invalid original filename.']]);
        }

        // Check all dot-separated segments against blocked executable extensions
        $segments = explode('.', strtolower($baseName));
        if (count($segments) < 2) {
            throw ValidationException::withMessages(['file' => ['File must have a valid extension.']]);
        }
        $extension = end($segments);
        foreach (array_slice($segments, 1) as $segmentExt) {
            if (in_array($segmentExt, self::BLOCKED_EXTENSIONS, true)) {
                throw ValidationException::withMessages(['file' => ['Executable or scriptable file types are prohibited.']]);
            }
        }

        $detectedMime = strtolower((string) $file->getMimeType());
        $allowedMap = $visibility === 'public' ? self::PUBLIC_ALLOWED_MIMES : self::PRIVATE_ALLOWED_MIMES;

        if (!isset($allowedMap[$detectedMime]) || !in_array($extension, $allowedMap[$detectedMime], true)) {
            throw ValidationException::withMessages([
                'file' => ["File MIME type ({$detectedMime}) or extension (.{$extension}) is not permitted for {$visibility} storage."],
            ]);
        }

        $size = (int) $file->getSize();
        $maxBytes = $visibility === 'private'
            ? self::MAX_BYTES_PRIVATE_DOCUMENT
            : (str_starts_with($detectedMime, 'video/') ? self::MAX_BYTES_PUBLIC_VIDEO : self::MAX_BYTES_PUBLIC_IMAGE);

        if ($size <= 0 || $size > $maxBytes) {
            throw ValidationException::withMessages([
                'file' => ['File exceeds the allowed size limit for this asset category.'],
            ]);
        }

        $sanitizedCategory = preg_replace('/[^a-zA-Z0-9_-]/', '', $category);
        if ($sanitizedCategory === '') {
            throw ValidationException::withMessages(['category' => ['Invalid media category.']]);
        }

        return [
            'original_filename' => Str::limit($baseName, 250, ''),
            'mime_type' => $detectedMime,
            'extension' => $extension,
            'file_size' => $size,
            'category' => $sanitizedCategory,
        ];
    }

    private function verifyAndResolveOwner(
        User $actor,
        string $visibility,
        ?string $ownerType,
        ?int $ownerId
    ): array {
        if ($visibility === 'public') {
            // Public site assets (logos, portfolio, hero media) belong to the site, not arbitrary client ownership
            return [null, null, null];
        }

        // For client uploaders, always verify ownership against their authenticated Client profile
        if ($actor->role === 'client') {
            $client = Client::where('user_id', $actor->id)
                ->where('account_status', 'active')
                ->first();

            if (!$client) {
                throw ValidationException::withMessages(['owner_id' => ['Active client account required.']]);
            }

            if ($ownerType === 'project' && $ownerId !== null) {
                $project = Project::where('id', $ownerId)
                    ->where('client_id', $client->id)
                    ->first();
                if (!$project) {
                    abort(403, 'You cannot upload private files to a project you do not own.');
                }
                return [Project::class, $project->id, $client->id];
            }

            // Default or explicit client attachment always binds to authenticated user's own Client ID
            if ($ownerId !== null && (int) $ownerId !== (int) $client->id && $ownerType === 'client') {
                abort(403, 'You cannot assign private files to another client account.');
            }

            return [Client::class, $client->id, $client->id];
        }

        // Admin uploaders must still reference real DB records and derive client_id from the DB record
        if ($ownerType === 'project' && $ownerId !== null) {
            $project = Project::findOrFail($ownerId);
            return [Project::class, $project->id, $project->client_id];
        }

        if ($ownerType === 'client' && $ownerId !== null) {
            $client = Client::findOrFail($ownerId);
            return [Client::class, $client->id, $client->id];
        }

        throw ValidationException::withMessages([
            'owner_id' => ['Private files must be associated with a verified client or project.'],
        ]);
    }

    private function buildDirectory(string $visibility, string $category, ?int $ownerId): string
    {
        $cleanCategory = preg_replace('/[^a-zA-Z0-9_-]/', '_', $category);
        $datePartition = now()->format('Y/m');
        if ($visibility === 'public') {
            return "public-assets/{$cleanCategory}/{$datePartition}";
        }

        $ownerSegment = $ownerId !== null ? (string) $ownerId : 'shared';
        return "private-clients/{$ownerSegment}/{$cleanCategory}/{$datePartition}";
    }

    public function assertSafeRelativePath(string $relativePath): string
    {
        $normalized = str_replace('\\', '/', str_replace("\0", '', $relativePath));
        $segments = explode('/', $normalized);

        if (
            $normalized === ''
            || str_starts_with($normalized, '/')
            || preg_match('/^[a-zA-Z]:\\//', $normalized) === 1
            || str_contains($normalized, '://')
            || in_array('.', $segments, true)
            || in_array('..', $segments, true)
            || in_array('', $segments, true)
        ) {
            throw new \InvalidArgumentException('Unsafe storage path detected.');
        }

        return $normalized;
    }
}
