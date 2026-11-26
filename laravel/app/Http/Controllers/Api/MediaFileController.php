<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Client;
use App\Models\MediaFile;
use App\Models\Project;
use App\Services\PersistentStorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\StreamedResponse;

class MediaFileController extends Controller
{
    public function __construct(private readonly PersistentStorageService $storage)
    {
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', MediaFile::class);

        // Validate filters before building any query. In particular, an unknown
        // owner_type must never disable a client's ownership scope.
        $filters = $request->validate([
            'visibility' => ['sometimes', 'nullable', 'in:public,private'],
            'category' => ['sometimes', 'nullable', 'string', 'max:64', 'regex:/\A[a-zA-Z0-9_-]+\z/'],
            'owner_type' => ['nullable', 'required_with:owner_id', 'in:client,project'],
            'owner_id' => ['nullable', 'required_with:owner_type', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'nullable', 'integer', 'min:1', 'max:100'],
            'page' => ['sometimes', 'nullable', 'integer', 'min:1'],
        ]);

        $actor = $request->user();
        $query = MediaFile::query()
            ->with('uploader:id,name')
            ->orderByDesc('created_at');

        if (!empty($filters['visibility'])) {
            $query->where('visibility', $filters['visibility']);
        }

        if (!empty($filters['category'])) {
            $query->where('category', $filters['category']);
        }

        if ($actor->role === 'client') {
            $client = Client::where('user_id', $actor->id)
                ->where('account_status', 'active')
                ->first();

            if (!$client) {
                $query->where('visibility', 'public');
            } else {
                $projectIds = Project::where('client_id', $client->id)->pluck('id')->all();

                if (!empty($filters['owner_type']) && isset($filters['owner_id'])) {
                    $requestedType = (string) $filters['owner_type'];
                    $requestedId = (int) $filters['owner_id'];
                    if ($requestedType === 'project') {
                        abort_unless(in_array($requestedId, $projectIds, true), 403, 'You cannot view files for this project.');
                        $query->where('visibility', 'private')
                            ->where('owner_type', Project::class)
                            ->where('owner_id', $requestedId);
                    } elseif ($requestedType === 'client') {
                        abort_unless($requestedId === (int) $client->id, 403, 'You cannot view files for another client.');
                        $query->where('visibility', 'private')
                            ->where('owner_type', Client::class)
                            ->where('owner_id', $client->id);
                    }
                } else {
                    $query->where(function ($sub) use ($client, $projectIds): void {
                        $sub->where('visibility', 'public')
                            ->orWhere(function ($ownClient) use ($client): void {
                                $ownClient->where('visibility', 'private')
                                    ->where('owner_type', Client::class)
                                    ->where('owner_id', $client->id);
                            });

                        if (!empty($projectIds)) {
                            $sub->orWhere(function ($ownProjects) use ($projectIds): void {
                                $ownProjects->where('visibility', 'private')
                                    ->where('owner_type', Project::class)
                                    ->whereIn('owner_id', $projectIds);
                            });
                        }
                    });
                }
            }
        } elseif ($actor->hasRole('custom_admin')) {
            // A Custom Admin's single view grant must not expose metadata for
            // private files belonging to other modules. Public assets remain
            // visible because they are intentionally public.
            $canViewProjects = $actor->hasPermissionTo('view_projects');
            $canViewClients = $actor->hasPermissionTo('view_clients');
            $canViewMessages = $actor->hasPermissionTo('view_messages');

            $query->where(function ($scope) use ($canViewProjects, $canViewClients, $canViewMessages): void {
                $scope->where('visibility', 'public');

                if ($canViewProjects || $canViewClients || $canViewMessages) {
                    $scope->orWhere(function ($private) use ($canViewProjects, $canViewClients, $canViewMessages): void {
                        $private->where('visibility', 'private')->where(function ($owners) use ($canViewProjects, $canViewClients, $canViewMessages): void {
                            $hasOwnerCondition = false;

                            if ($canViewProjects) {
                                $owners->where(function ($projectFiles): void {
                                    $projectFiles->where('owner_type', Project::class)
                                        ->where('category', '!=', 'message_attachment');
                                });
                                $hasOwnerCondition = true;
                            }

                            if ($canViewClients) {
                                $method = $hasOwnerCondition ? 'orWhere' : 'where';
                                $owners->{$method}(function ($clientFiles): void {
                                    $clientFiles->where('owner_type', Client::class)
                                        ->where('category', '!=', 'message_attachment');
                                });
                                $hasOwnerCondition = true;
                            }

                            if ($canViewMessages) {
                                $method = $hasOwnerCondition ? 'orWhere' : 'where';
                                $owners->{$method}(function ($messageFiles): void {
                                    $messageFiles->where('category', 'message_attachment');
                                });
                            }
                        });
                    });
                }
            });

            if (!empty($filters['owner_type']) && isset($filters['owner_id'])) {
                $ownerMap = ['client' => Client::class, 'project' => Project::class];
                $mappedType = $ownerMap[$filters['owner_type']];
                $query->where('owner_type', $mappedType)
                    ->where('owner_id', (int) $filters['owner_id']);
            }
        } else {
            if (!empty($filters['owner_type']) && isset($filters['owner_id'])) {
                $ownerMap = [
                    'client' => Client::class,
                    'project' => Project::class,
                ];
                $mappedType = $ownerMap[$filters['owner_type']];
                $query->where('owner_type', $mappedType)
                    ->where('owner_id', (int) $filters['owner_id']);
            }
        }

        $perPage = (int) ($filters['per_page'] ?? 30);

        return response()->json($query->paginate($perPage));
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'file' => ['required', 'file'],
            'visibility' => ['required', 'in:public,private'],
            'category' => ['required', 'string', 'max:64'],
            'owner_type' => ['nullable', 'in:client,project'],
            'owner_id' => ['nullable', 'integer', 'min:1'],
        ]);

        if ($validated['visibility'] === 'public') {
            $this->authorize('uploadPublic', MediaFile::class);
        } else {
            $this->authorize('uploadPrivate', MediaFile::class);

            if (($validated['owner_type'] ?? null) === 'project' && !empty($validated['owner_id'])) {
                $targetProject = Project::findOrFail((int) $validated['owner_id']);
                $this->authorize('update', $targetProject);
            } elseif (($validated['owner_type'] ?? null) === 'client' && !empty($validated['owner_id'])) {
                $targetClient = Client::findOrFail((int) $validated['owner_id']);
                $this->authorize(
                    $request->user()->hasRole('client') ? 'updateOwn' : 'update',
                    $targetClient
                );
            }
        }

        $mediaFile = $this->storage->storeUpload(
            $request->file('file'),
            $request->user(),
            $validated['visibility'],
            $validated['category'],
            $validated['owner_type'] ?? null,
            isset($validated['owner_id']) ? (int) $validated['owner_id'] : null
        );

        return response()->json([
            'data' => $mediaFile,
        ], 201);
    }

    public function show(string $fileUid): JsonResponse
    {
        $mediaFile = MediaFile::with('uploader:id,name')
            ->where('file_uid', $fileUid)
            ->firstOrFail();
        $this->authorize('view', $mediaFile);

        return response()->json([
            'data' => $mediaFile,
        ]);
    }

    public function download(Request $request, string $fileUid): StreamedResponse
    {
        $mediaFile = MediaFile::where('file_uid', $fileUid)->firstOrFail();
        $this->authorize('view', $mediaFile);

        return $this->storage->streamFile($mediaFile, $request->boolean('download', true));
    }

    public function signedUrl(Request $request, string $fileUid): JsonResponse
    {
        $mediaFile = MediaFile::where('file_uid', $fileUid)->firstOrFail();
        $this->authorize('view', $mediaFile);

        $ttlMinutes = max(1, min(15, $request->integer('ttl_minutes', 5)));
        $signedUrl = $this->storage->createSignedDownloadUrl($mediaFile, $ttlMinutes);

        return response()->json([
            'data' => [
                'file_uid' => $mediaFile->file_uid,
                'signed_url' => $signedUrl,
                'expires_in_minutes' => $ttlMinutes,
            ],
        ]);
    }

    public function signedDownload(Request $request, string $fileUid): StreamedResponse
    {
        // This endpoint accepts a short-lived signed URL as a bearer capability.
        // The URL is issued only after an authenticated policy check; recipients
        // do not need to keep the original browser session for the short download window.
        abort_unless($request->hasValidSignature(), 403, 'Download link is invalid or has expired.');

        $mediaFile = MediaFile::where('file_uid', $fileUid)->firstOrFail();

        if ($mediaFile->isPrivate() && $request->user() !== null) {
            abort_unless(
                Gate::forUser($request->user())->allows('view', $mediaFile),
                403,
                'You are not authorized to download this file.'
            );
        }

        return $this->storage->streamFile($mediaFile, $request->boolean('download', true));
    }

    public function replace(Request $request, string $fileUid): JsonResponse
    {
        $mediaFile = MediaFile::where('file_uid', $fileUid)->firstOrFail();
        $this->authorize('replace', $mediaFile);

        $request->validate([
            'file' => ['required', 'file'],
        ]);

        $updated = $this->storage->replaceUpload(
            $mediaFile,
            $request->file('file'),
            $request->user()
        );

        return response()->json([
            'data' => $updated,
        ]);
    }

    public function destroy(string $fileUid): JsonResponse
    {
        $mediaFile = MediaFile::where('file_uid', $fileUid)->firstOrFail();
        $this->authorize('delete', $mediaFile);

        $this->storage->deleteFile($mediaFile);

        return response()->json([
            'message' => 'File deleted successfully.',
        ]);
    }
}
