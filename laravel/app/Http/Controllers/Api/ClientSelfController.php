<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AcceptClientInvitationRequest;
use App\Http\Requests\UpdateOwnClientProfileRequest;
use App\Models\Client;
use App\Models\ClientActivityLog;
use App\Models\ClientInvitation;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ClientSelfController extends Controller
{
    public function showProfile(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->hasRole('client')) {
            return response()->json([
                'success' => false,
                'message' => 'Only authenticated clients can access this profile.',
            ], 403);
        }

        $client = Client::with(['user:id,email_verified_at', 'services'])
            ->where('user_id', $user->id)
            ->first();

        if (!$client) {
            return response()->json([
                'success' => false,
                'message' => 'Client profile not found.',
            ], 404);
        }

        $this->authorize('viewOwnProfile', $client);

        return response()->json([
            'success' => true,
            'data' => $client,
        ]);
    }

    public function updateProfile(UpdateOwnClientProfileRequest $request): JsonResponse
    {
        $user = $request->user();
        if (!$user || !$user->hasRole('client')) {
            return response()->json([
                'success' => false,
                'message' => 'Only authenticated clients can update this profile.',
            ], 403);
        }

        $client = Client::where('user_id', $user->id)->first();
        if (!$client) {
            return response()->json([
                'success' => false,
                'message' => 'Client profile not found.',
            ], 404);
        }

        $this->authorize('updateOwn', $client);
        $validated = $request->validated();

        DB::transaction(function () use ($client, $user, $validated): void {
            $lockedClient = Client::query()->whereKey($client->id)->lockForUpdate()->firstOrFail();
            $lockedUser = User::query()->whereKey($user->id)->lockForUpdate()->firstOrFail();

            $lockedClient->update([
                'full_name' => $validated['full_name'],
                'phone' => $validated['phone'] ?? null,
                'company_name' => $validated['company_name'] ?? null,
                'address' => $validated['address'] ?? null,
            ]);

            $lockedUser->name = $validated['full_name'];
            $lockedUser->save();

            ClientActivityLog::create([
                'client_id' => $lockedClient->id,
                'actor_id' => $lockedUser->id,
                'action' => 'client_self_updated',
                'description' => 'Client updated permitted personal profile details.',
                'created_at' => now(),
            ]);
        });

        $client->load(['user:id,email_verified_at', 'services']);

        return response()->json([
            'success' => true,
            'message' => 'Profile updated successfully.',
            'data' => $client,
        ]);
    }

    public function verifyInvitation(Request $request): JsonResponse
    {
        $token = trim((string) $request->input('token', $request->query('token', '')));
        if ($token === '') {
            return response()->json([
                'success' => false,
                'message' => 'Invitation token is required.',
            ], 422);
        }

        $invitation = ClientInvitation::with([
            'client:id,user_id,client_code,full_name,email,company_name,account_status',
            'user:id,email,email_verified_at,role',
        ])->where('token_hash', hash('sha256', $token))->first();

        if (!$this->isInvitationEligible($invitation)) {
            return response()->json([
                'success' => false,
                'message' => 'This invitation link is invalid, expired, already used, or has been revoked.',
            ], 410);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'client_code' => $invitation->client->client_code,
                'full_name' => $invitation->client->full_name,
                'email' => $invitation->client->email,
                'company_name' => $invitation->client->company_name,
                'expires_at' => $invitation->expires_at->toIso8601String(),
            ],
        ]);
    }

    public function acceptInvitation(AcceptClientInvitationRequest $request): JsonResponse
    {
        $validated = $request->validated();
        $tokenHash = hash('sha256', $validated['token']);

        $accepted = DB::transaction(function () use ($tokenHash, $validated): bool {
            // Lock and re-check the token inside the transaction to prevent a
            // concurrent request from consuming the same invitation twice.
            $invitation = ClientInvitation::query()
                ->where('token_hash', $tokenHash)
                ->lockForUpdate()
                ->first();

            if (!$invitation || !$invitation->isUsable()) {
                return false;
            }

            $client = Client::query()->whereKey($invitation->client_id)->lockForUpdate()->first();
            $user = User::query()->whereKey($invitation->user_id)->lockForUpdate()->first();

            if (!$client || !$user
                || (int) $client->user_id !== (int) $user->id
                || !$user->hasRole('client')
                || $user->email_verified_at !== null
                || strcasecmp((string) $client->email, (string) $user->email) !== 0
                || $client->account_status === 'suspended') {
                $invitation->revoked_at = now();
                $invitation->save();
                return false;
            }

            // The User model's hashed cast hashes the plain password on assignment.
            $user->forceFill([
                'password' => $validated['password'],
                'is_active' => true,
                'email_verified_at' => now(),
                'suspended_at' => null,
                'auth_version' => ((int) $user->auth_version) + 1,
                'remember_token' => Str::random(60),
            ])->save();

            $client->account_status = 'active';
            $client->activated_at = now();
            $client->suspended_at = null;
            $client->save();

            $invitation->accepted_at = now();
            $invitation->save();

            // Successful activation invalidates every other outstanding link.
            ClientInvitation::query()
                ->where('client_id', $client->id)
                ->where('id', '<>', $invitation->id)
                ->whereNull('accepted_at')
                ->whereNull('revoked_at')
                ->update(['revoked_at' => now()]);

            ClientActivityLog::create([
                'client_id' => $client->id,
                'actor_id' => $user->id,
                'action' => 'invitation_accepted',
                'description' => 'Client completed password setup and activated their account.',
                'created_at' => now(),
            ]);

            return true;
        });

        if (!$accepted) {
            return response()->json([
                'success' => false,
                'message' => 'This invitation link is invalid, expired, already used, or has been revoked.',
            ], 410);
        }

        return response()->json([
            'success' => true,
            'message' => 'Your account has been activated. You may now sign in.',
        ]);
    }

    private function isInvitationEligible(?ClientInvitation $invitation): bool
    {
        if (!$invitation || !$invitation->isUsable() || !$invitation->client || !$invitation->user) {
            return false;
        }

        return (int) $invitation->client->user_id === (int) $invitation->user->id
            && $invitation->user->hasRole('client')
            && $invitation->user->email_verified_at === null
            && strcasecmp((string) $invitation->client->email, (string) $invitation->user->email) === 0
            && $invitation->client->account_status !== 'suspended';
    }
}
