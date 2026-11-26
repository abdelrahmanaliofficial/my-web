<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreClientRequest;
use App\Http\Requests\UpdateClientRequest;
use App\Models\Client;
use App\Models\ClientActivityLog;
use App\Models\ClientInvitation;
use App\Models\Project;
use App\Models\User;
use App\Notifications\ClientAccountInvitationNotification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

class ClientController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', Client::class);

        $filters = $request->validate([
            'search' => ['sometimes', 'nullable', 'string', 'max:120'],
            'status' => ['sometimes', 'nullable', 'in:invited,active,suspended'],
            'service_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', 'max:100'],
        ]);

        $query = Client::query()->with([
            'user:id,email_verified_at',
            'services',
            'latestInvitation',
        ]);

        if (!empty($filters['search'])) {
            $search = trim($filters['search']);
            $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $search);
            $query->where(function ($q) use ($escaped): void {
                $q->where('client_code', 'like', "%{$escaped}%")
                    ->orWhere('full_name', 'like', "%{$escaped}%")
                    ->orWhere('email', 'like', "%{$escaped}%")
                    ->orWhere('company_name', 'like', "%{$escaped}%")
                    ->orWhere('phone', 'like', "%{$escaped}%");
            });
        }

        if (!empty($filters['status'])) {
            $query->where('account_status', $filters['status']);
        }

        if (!empty($filters['service_id'])) {
            $query->whereHas('services', fn ($q) => $q->where('services.id', $filters['service_id']));
        }

        $perPage = (int) ($filters['per_page'] ?? 15);
        $clients = $query->orderByDesc('created_at')->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => $clients->items(),
            'meta' => [
                'current_page' => $clients->currentPage(),
                'last_page' => $clients->lastPage(),
                'per_page' => $clients->perPage(),
                'total' => $clients->total(),
            ],
        ]);
    }

    public function store(StoreClientRequest $request): JsonResponse
    {
        $this->authorize('create', Client::class);

        $validated = $request->validated();
        $sendInvitation = $request->boolean('send_invitation', true);
        $actor = $request->user();

        // Creating a client profile/account is distinct from sending an invitation.
        // Invitation delivery requires explicit manage_clients permission.
        if ($sendInvitation) {
            $this->authorize('inviteAny', Client::class);
        }

        [$clientId, $plainToken, $expiresAt, $invitationId] = DB::transaction(function () use ($validated, $sendInvitation, $actor): array {
            // The account and profile are created atomically. The hashed placeholder
            // password is never known or returned; the client sets their own password.
            $user = User::create([
                'name' => $validated['full_name'],
                'email' => $validated['email'],
                'password' => Str::random(64),
                'role' => 'client',
                'is_active' => false,
                'suspended_at' => null,
            ]);

            $client = Client::create([
                'user_id' => $user->id,
                'full_name' => $validated['full_name'],
                'email' => $validated['email'],
                'phone' => $validated['phone'] ?? null,
                'company_name' => $validated['company_name'] ?? null,
                'address' => $validated['address'] ?? null,
                'account_status' => 'invited',
                'invited_at' => null,
            ]);

            if (!empty($validated['service_ids'])) {
                $this->syncContractedServices($client, $validated['service_ids']);
            }

            $plainToken = null;
            $expiresAt = null;
            $invitationId = null;

            if ($sendInvitation) {
                [$plainToken, $expiresAt, $invitationId] = $this->issueInvitationToken($client, $user, $actor->id);
                $client->invited_at = now();
                $client->save();
            }

            $this->logActivity(
                $client,
                $actor->id,
                'client_created',
                'Client profile and associated client account created.',
                [
                    'invitation_requested' => $sendInvitation,
                    'service_ids' => $validated['service_ids'] ?? [],
                ]
            );

            return [$client->id, $plainToken, $expiresAt, $invitationId];
        });

        $client = Client::query()->with('user')->findOrFail($clientId);
        $delivery = ['status' => 'not_requested', 'message' => 'No invitation was requested.'];

        if ($sendInvitation && $plainToken !== null && $expiresAt instanceof Carbon && $invitationId !== null) {
            $delivery = $this->deliverInvitation($client, $plainToken, $expiresAt, $invitationId);
        }

        $client->load($this->adminClientRelations($actor));

        return response()->json([
            'success' => true,
            'message' => $this->clientCreationMessage($sendInvitation, $delivery['status']),
            'invitation' => [
                'requested' => $sendInvitation,
                'delivery_status' => $delivery['status'],
                'delivery_message' => $delivery['message'],
            ],
            'data' => $client,
        ], 201);
    }

    public function show(Request $request, Client $client): JsonResponse
    {
        $this->authorize('view', $client);
        $client->load($this->adminClientRelations($request->user()));

        return response()->json([
            'success' => true,
            'data' => $client,
        ]);
    }

    public function update(UpdateClientRequest $request, Client $client): JsonResponse
    {
        $this->authorize('update', $client);

        $validated = $request->validated();
        $actor = $request->user();
        $requestedEmail = $validated['email'] ?? $client->email;
        $emailChanged = Str::lower(trim($requestedEmail)) !== Str::lower((string) $client->email);
        if ($emailChanged) {
            // Email changes invalidate the active login and require an invitation to the new address.
            // Restrict this lifecycle-changing operation to administrators with full client-management permission.
            $this->authorize('changeEmail', $client);
        }

        DB::transaction(function () use ($client, $validated, $actor, $emailChanged, $requestedEmail): void {
            /** @var Client $lockedClient */
            $lockedClient = Client::query()->whereKey($client->id)->lockForUpdate()->firstOrFail();
            $user = $lockedClient->user()->lockForUpdate()->first();

            $lockedClient->fill([
                'full_name' => $validated['full_name'] ?? $lockedClient->full_name,
                'email' => $requestedEmail,
                'phone' => array_key_exists('phone', $validated) ? $validated['phone'] : $lockedClient->phone,
                'company_name' => array_key_exists('company_name', $validated) ? $validated['company_name'] : $lockedClient->company_name,
                'address' => array_key_exists('address', $validated) ? $validated['address'] : $lockedClient->address,
            ]);

            if ($emailChanged) {
                // A previously issued invitation must not remain usable after the
                // destination address changes. The account must be invited again.
                ClientInvitation::query()
                    ->where('client_id', $lockedClient->id)
                    ->whereNull('accepted_at')
                    ->whereNull('revoked_at')
                    ->update(['revoked_at' => now()]);

                $lockedClient->account_status = 'invited';
                $lockedClient->invited_at = null;
                $lockedClient->suspended_at = null;
            }

            $lockedClient->save();

            if ($user) {
                $user->name = $lockedClient->full_name;
                if ($emailChanged) {
                    $user->email = $requestedEmail;
                    $user->email_verified_at = null;
                    $user->is_active = false;
                    $user->suspended_at = null;
                }
                $user->save();

                if ($emailChanged) {
                    $this->revokeUserSessions($user);
                }
            }

            if (array_key_exists('service_ids', $validated)) {
                $this->syncContractedServices($lockedClient, $validated['service_ids']);
            }

            $this->logActivity(
                $lockedClient,
                $actor->id,
                'client_updated',
                $emailChanged
                    ? 'Client profile updated; email change invalidated previous invitations and sessions.'
                    : 'Client profile information updated by administrator.',
                [
                    'email_changed' => $emailChanged,
                    'service_ids_updated' => array_key_exists('service_ids', $validated),
                ]
            );
        });

        $client = Client::query()->findOrFail($client->id);
        $client->load($this->adminClientRelations($actor));

        return response()->json([
            'success' => true,
            'message' => $emailChanged
                ? 'Client updated. The previous invitation and sessions were revoked; send a new invitation to the updated email address.'
                : 'Client profile updated successfully.',
            'requires_reinvitation' => $emailChanged,
            'data' => $client,
        ]);
    }

    public function syncServices(Request $request, Client $client): JsonResponse
    {
        $this->authorize('update', $client);

        $validated = $request->validate([
            'service_ids' => ['required', 'array'],
            'service_ids.*' => ['integer', 'distinct', 'exists:services,id'],
        ]);

        DB::transaction(function () use ($client, $validated, $request): void {
            $lockedClient = Client::query()->whereKey($client->id)->lockForUpdate()->firstOrFail();
            $this->syncContractedServices($lockedClient, $validated['service_ids']);

            $this->logActivity(
                $lockedClient,
                $request->user()->id,
                'services_updated',
                'Assigned contracted services updated.',
                ['service_ids' => $validated['service_ids']]
            );
        });

        $client->load('services');

        return response()->json([
            'success' => true,
            'message' => 'Contracted services updated.',
            'data' => $client,
        ]);
    }

    public function updateStatus(Request $request, Client $client): JsonResponse
    {
        $this->authorize('manageStatus', $client);

        $validated = $request->validate([
            'account_status' => ['required', 'in:active,suspended'],
        ]);

        $nextStatus = $validated['account_status'];
        $actor = $request->user();

        if ($nextStatus === 'active') {
            $client->loadMissing('user:id,email_verified_at,is_active,suspended_at');
            if (!$client->user || !$client->user->email_verified_at) {
                return response()->json([
                    'success' => false,
                    'code' => 'client_setup_incomplete',
                    'message' => 'The client cannot be activated manually before completing the secure invitation and password setup.',
                ], 409);
            }
        }

        DB::transaction(function () use ($client, $nextStatus, $actor): void {
            $lockedClient = Client::query()->whereKey($client->id)->lockForUpdate()->firstOrFail();

            if ($nextStatus === 'active') {
                $user = $lockedClient->user()->lockForUpdate()->first();
                if (!$user || !$user->email_verified_at) {
                    abort(409, 'The client must complete account setup before activation.');
                }

                // Capture the complete previous state before mutating either record.
                // This ensures a previously suspended/inconsistent account has its
                // sessions revoked even when only one side of the state was stale.
                $wasFullyActive = $lockedClient->account_status === 'active' && $user->isActive();

                $lockedClient->account_status = 'active';
                $lockedClient->activated_at = $lockedClient->activated_at ?? now();
                $lockedClient->suspended_at = null;
                $lockedClient->save();

                $user->is_active = true;
                $user->suspended_at = null;
                $user->save();
                if (!$wasFullyActive) {
                    $this->revokeUserSessions($user);
                }

                $this->logActivity($lockedClient, $actor->id, 'account_activated', 'Client account activated after completed setup.');
            } else {
                $this->suspendClientInternal(
                    $lockedClient,
                    $actor->id,
                    'account_suspended',
                    'Client account suspended and active sessions revoked.'
                );
            }
        });

        $client = Client::query()->findOrFail($client->id);
        $client->load($this->adminClientRelations($actor));

        return response()->json([
            'success' => true,
            'message' => $nextStatus === 'active'
                ? 'Client account activated.'
                : 'Client account suspended and sessions revoked.',
            'data' => $client,
        ]);
    }

    public function sendInvitation(Request $request, Client $client): JsonResponse
    {
        $this->authorize('invite', $client);
        $actor = $request->user();

        [$clientId, $plainToken, $expiresAt, $invitationId] = DB::transaction(function () use ($client, $actor): array {
            /** @var Client $lockedClient */
            $lockedClient = Client::query()->whereKey($client->id)->lockForUpdate()->firstOrFail();
            $user = $lockedClient->user()->lockForUpdate()->first();

            if (!$user) {
                // Support legacy client profiles created before account linking.
                // Never attach an unrelated existing account by matching email alone.
                if (User::query()->where('email', $lockedClient->email)->exists()) {
                    abort(409, 'A user account already uses this email. Resolve the account association before inviting this legacy client.');
                }

                $user = User::create([
                    'name' => $lockedClient->full_name,
                    'email' => $lockedClient->email,
                    'password' => Str::random(64),
                    'role' => 'client',
                    'is_active' => false,
                    'suspended_at' => null,
                ]);
                $lockedClient->user_id = $user->id;
                $lockedClient->save();
            }

            if (!$user->hasRole('client')) {
                abort(409, 'The associated user account is not assigned to the client role.');
            }

            if (strcasecmp((string) $user->email, (string) $lockedClient->email) !== 0) {
                abort(409, 'The client profile and linked account email addresses do not match. Update the profile before inviting.');
            }

            if ($user->email_verified_at !== null) {
                abort(409, 'This client has already completed account setup. Use the password reset process instead of sending another setup invitation.');
            }

            // A client with an uncompleted account may be re-invited even if an
            // administrator previously suspended the pending account.
            $user->is_active = false;
            $user->suspended_at = null;
            $user->save();
            // A fresh invitation always invalidates any sessions or tokens that may
            // have survived an earlier partial/legacy account-state transition.
            $this->revokeUserSessions($user);

            [$token, $expiry, $newInvitationId] = $this->issueInvitationToken($lockedClient, $user, $actor->id);

            $lockedClient->account_status = 'invited';
            $lockedClient->invited_at = now();
            $lockedClient->suspended_at = null;
            $lockedClient->save();

            $this->logActivity(
                $lockedClient,
                $actor->id,
                'invitation_created',
                'A secure, expiring password setup invitation was generated.',
                ['invitation_id' => $newInvitationId]
            );

            return [$lockedClient->id, $token, $expiry, $newInvitationId];
        });

        $client = Client::query()->with('user')->findOrFail($clientId);
        $delivery = $this->deliverInvitation($client, $plainToken, $expiresAt, $invitationId);
        $client->load($this->adminClientRelations($actor));

        return response()->json([
            'success' => true,
            'message' => $this->invitationMessage($delivery['status']),
            'invitation' => [
                'delivery_status' => $delivery['status'],
                'delivery_message' => $delivery['message'],
                'expires_at' => $expiresAt->toIso8601String(),
            ],
            'data' => $client,
        ], $delivery['status'] === 'failed' ? 202 : 200);
    }

    public function resendInvitation(Request $request, Client $client): JsonResponse
    {
        return $this->sendInvitation($request, $client);
    }

    public function revokeAccess(Request $request, Client $client): JsonResponse
    {
        $this->authorize('revokeAccess', $client);

        DB::transaction(function () use ($client, $request): void {
            $lockedClient = Client::query()->whereKey($client->id)->lockForUpdate()->firstOrFail();
            $this->suspendClientInternal(
                $lockedClient,
                $request->user()->id,
                'access_revoked',
                'Client portal access revoked, active invitations invalidated, and sessions terminated.'
            );
        });

        $client = Client::query()->findOrFail($client->id);
        $client->load($this->adminClientRelations($request->user()));

        return response()->json([
            'success' => true,
            'message' => 'Client access revoked.',
            'data' => $client,
        ]);
    }

    public function activity(Client $client): JsonResponse
    {
        $this->authorize('view', $client);

        return response()->json([
            'success' => true,
            'data' => $client->activityLogs()->with('actor:id,name,email')->get(),
        ]);
    }

    public function projects(Client $client): JsonResponse
    {
        $this->authorize('view', $client);
        $this->authorize('viewAny', Project::class);

        return response()->json([
            'success' => true,
            'data' => $client->projects()->get(),
        ]);
    }

    /**
     * A client profile is retained because it may own project, invoice, message,
     * file and audit history. Access must be revoked or suspended instead.
     */
    public function destroy(Request $request, Client $client): JsonResponse
    {
        $this->authorize('delete', $client);

        return response()->json([
            'success' => false,
            'code' => 'client_history_retention',
            'message' => 'Permanent client deletion is disabled to preserve project, invoice, message and audit history. Suspend or revoke portal access instead.',
        ], 409);
    }

    /**
     * Keep project records out of client-management responses unless the actor
     * also has explicit project-view permission. Client self-service uses reduced APIs.
     *
     * @return list<string>
     */
    private function adminClientRelations(User $actor): array
    {
        $relations = [
            'user:id,email_verified_at',
            'services',
            'latestInvitation',
            'activityLogs.actor:id,name,email',
        ];

        if ($actor->hasPermissionTo('view_projects')) {
            $relations[] = 'projects';
        }

        return $relations;
    }

    /** @return array{0:string,1:Carbon,2:int} */
    private function issueInvitationToken(Client $client, User $user, int $actorId): array
    {
        ClientInvitation::query()
            ->where('client_id', $client->id)
            ->whereNull('accepted_at')
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        $plainToken = Str::random(64);
        $expiresAt = now()->addHours(48);

        $invitation = ClientInvitation::create([
            'client_id' => $client->id,
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $plainToken),
            'expires_at' => $expiresAt,
            'invited_by' => $actorId,
            'delivery_status' => 'pending',
        ]);

        return [$plainToken, $expiresAt, $invitation->id];
    }

    /** @return array{status:string,message:string} */
    private function deliverInvitation(Client $client, string $plainToken, Carbon $expiresAt, int $invitationId): array
    {
        $mailer = (string) config('mail.default', 'log');
        $status = 'failed';
        $message = 'Invitation was generated, but the mail transport did not accept it.';
        $deliveryError = null;
        $acceptedAt = null;

        if ($mailer === 'log' || ($mailer === 'array' && !app()->environment('testing'))) {
            $status = 'not_configured';
            $message = 'Invitation was generated but not emailed. Configure a real MAIL_MAILER transport in laravel/.env.';
            $deliveryError = 'The configured mailer does not deliver email to recipients.';
        } else {
            try {
                if (!$client->user) {
                    throw new \RuntimeException('The client account is missing.');
                }

                $client->user->notify(new ClientAccountInvitationNotification($client, $plainToken, $expiresAt));

                if ($mailer === 'array' && app()->environment('testing')) {
                    $status = 'test_sink';
                    $message = 'Invitation notification was captured by the test mail transport; no real email was delivered.';
                } else {
                    $status = 'accepted';
                    $message = 'Invitation was accepted by the configured mail transport.';
                    $acceptedAt = now();
                }
            } catch (Throwable $exception) {
                Log::warning('Client account invitation delivery failed.', [
                    'client_id' => $client->id,
                    'user_id' => $client->user_id,
                    'invitation_id' => $invitationId,
                    'exception' => get_class($exception),
                ]);
                $status = 'failed';
                $message = 'Client account was created, but invitation delivery failed. Check server mail configuration and logs, then resend.';
                $deliveryError = 'Mail transport failed. Check the server mail logs.';
            }
        }

        ClientInvitation::query()->whereKey($invitationId)->update([
            'delivery_status' => $status,
            'delivery_accepted_at' => $acceptedAt,
            'delivery_error' => $deliveryError,
        ]);

        $this->logActivity(
            $client,
            null,
            'invitation_delivery_' . $status,
            $message,
            ['invitation_id' => $invitationId]
        );

        return ['status' => $status, 'message' => $message];
    }

    private function invitationMessage(string $status): string
    {
        return match ($status) {
            'accepted' => 'Invitation was accepted by the configured mail transport.',
            'test_sink' => 'Invitation was captured by the test mail transport; no real email was sent.',
            'not_configured' => 'Invitation was generated, but email delivery is not configured.',
            default => 'Invitation was generated, but email delivery failed. You can correct mail settings and resend it.',
        };
    }

    private function clientCreationMessage(bool $invitationRequested, string $deliveryStatus): string
    {
        if (!$invitationRequested) {
            return 'Client profile and account created. No invitation was requested.';
        }

        return $this->invitationMessage($deliveryStatus);
    }

    /** @param list<int> $serviceIds */
    private function syncContractedServices(Client $client, array $serviceIds): void
    {
        $existing = $client->services()->get()->keyBy('id');
        $syncData = [];

        foreach ($serviceIds as $serviceId) {
            $current = $existing->get($serviceId);
            $syncData[$serviceId] = [
                'contract_status' => $current?->pivot?->contract_status ?? 'active',
                'assigned_at' => $current?->pivot?->assigned_at ?? now(),
                'notes' => $current?->pivot?->notes,
            ];
        }

        $client->services()->sync($syncData);
    }

    private function suspendClientInternal(Client $client, int $actorId, string $action, string $description): void
    {
        $client->account_status = 'suspended';
        $client->suspended_at = now();
        $client->save();

        ClientInvitation::query()
            ->where('client_id', $client->id)
            ->whereNull('accepted_at')
            ->whereNull('revoked_at')
            ->update(['revoked_at' => now()]);

        $user = $client->user()->lockForUpdate()->first();
        if ($user) {
            $user->is_active = false;
            $user->suspended_at = now();
            $user->save();
            $this->revokeUserSessions($user);
        }

        $this->logActivity($client, $actorId, $action, $description);
    }

    private function revokeUserSessions(User $user): void
    {
        // The version check revokes file-driver sessions as well as DB sessions.
        $user->bumpAuthVersion();
        $user->tokens()->delete();

        if (Schema::hasTable('sessions')) {
            DB::table('sessions')->where('user_id', $user->id)->delete();
        }
    }

    private function logActivity(Client $client, ?int $actorId, string $action, string $description, ?array $metadata = null): void
    {
        ClientActivityLog::create([
            'client_id' => $client->id,
            'actor_id' => $actorId,
            'action' => $action,
            'description' => $description,
            'metadata' => $metadata,
            'created_at' => now(),
        ]);
    }
}
