<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AdminActivityLog;
use App\Models\User;
use App\Authorization\PermissionCatalog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

class TeamController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorize('viewAny', User::class);

        $query = User::query()
            ->whereHas('roleRecord', fn ($roleQuery) => $roleQuery->where('slug', 'custom_admin'));

        if ($request->user()->hasRole('super_admin')) {
            $query->orWhereHas('roleRecord', fn ($roleQuery) => $roleQuery->where('slug', 'super_admin'));
        }

        $members = $query
            ->with(['roleRecord:id,name,slug', 'permissionRecords:id,slug'])
            ->orderBy('name')
            ->get()
            ->map(fn (User $member) => $member->toSafeArray());

        return response()->json(['success' => true, 'data' => $members]);
    }

    public function permissionCatalog(Request $request): JsonResponse
    {
        $this->authorize('viewPermissionCatalog', User::class);

        $actor = $request->user();
        $catalog = PermissionCatalog::asList();
        if ($actor->hasRole('custom_admin')) {
            $catalog = array_values(array_filter(
                $catalog,
                fn (array $permission): bool => $actor->hasPermissionTo($permission['slug'])
            ));
        }

        return response()->json([
            'success' => true,
            'data' => $catalog,
        ]);
    }

    public function activity(Request $request): JsonResponse
    {
        $this->authorize('viewActivity', User::class);

        $logsQuery = AdminActivityLog::query();
        if ($request->user()->hasRole('custom_admin')) {
            $customAdminIds = User::query()
                ->whereHas('roleRecord', fn ($roleQuery) => $roleQuery->where('slug', 'custom_admin'))
                ->pluck('id');
            $logsQuery->where('subject_type', User::class)
                ->whereIn('subject_id', $customAdminIds)
                ->whereIn('action', [
                    'team_member_created', 'team_invitation_dispatched', 'team_invitation_not_delivered',
                    'team_invitation_delivery_failed', 'team_invitation_resent', 'team_permissions_updated',
                    'team_member_activated', 'team_member_suspended', 'team_member_sessions_revoked',
                ]);
        }

        $logs = $logsQuery
            ->with('actor:id,name,email,role_id')
            ->latest('created_at')
            ->limit(100)
            ->get();

        $data = $logs->map(fn (AdminActivityLog $log) => [
            'id' => $log->id,
            'actor_name' => $log->actor?->name ?? 'System',
            'action' => $log->action,
            'target' => $log->subject_type ? $log->subject_type . ':' . $log->subject_id : null,
            'created_at' => $log->created_at?->toISOString(),
        ]);

        return response()->json(['success' => true, 'data' => $data]);
    }

    public function invite(Request $request): JsonResponse
    {
        $this->authorize('create', User::class);

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'email:rfc', 'max:255', 'unique:users,email'],
            'role' => ['required', 'in:custom_admin'],
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', 'distinct', \Illuminate\Validation\Rule::in(PermissionCatalog::slugs())],
        ]);

        abort_unless(\Illuminate\Support\Facades\Gate::allows('createWithPermissions', [User::class, array_values($validated['permissions'])]), 403);

        $member = DB::transaction(function () use ($validated, $request): User {
            $member = User::create([
                'name' => trim($validated['name']),
                'email' => mb_strtolower(trim($validated['email'])),
                'password' => Str::random(80),
                'role' => 'custom_admin',
                'is_active' => false,
                'suspended_at' => null,
            ]);

            $member->syncPermissions(array_values($validated['permissions']), $request->user());
            $this->record($request->user(), 'team_member_created', $member, ['permissions' => $member->permissions]);
            return $member;
        });

        try {
            $status = Password::sendResetLink(['email' => $member->email]);
        } catch (\Throwable $exception) {
            report($exception);
            $this->record($request->user(), 'team_invitation_delivery_failed', $member);

            return response()->json([
                'success' => true,
                'message' => 'The team account was created, but the invitation email was not delivered. Configure mail delivery and use Resend Invitation.',
                'data' => ['user' => $member->toSafeArray(), 'invitation_sent' => false],
            ], 201);
        }

        // Laravel's log mailer records the message locally; it does not deliver
        // an email. Report this accurately so the UI never claims an invitation
        // was delivered in a development environment.
        $mailWasActuallyDispatched = $status === Password::RESET_LINK_SENT
            && config('mail.default') !== 'log';

        if ($mailWasActuallyDispatched) {
            $this->record($request->user(), 'team_invitation_dispatched', $member);
        } else {
            $this->record($request->user(), 'team_invitation_not_delivered', $member, [
                'password_broker_status' => (string) $status,
                'mail_driver' => (string) config('mail.default'),
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => $mailWasActuallyDispatched
                ? 'Team member created and password setup link sent.'
                : 'Team member created. Email delivery is not configured or the password setup link could not be sent; configure mail and use Resend Invitation.',
            'data' => ['user' => $member->toSafeArray(), 'invitation_sent' => $mailWasActuallyDispatched],
        ], 201);
    }

    public function resendInvitation(Request $request, User $user): JsonResponse
    {
        // Team management must never mutate a Super Admin account, including
        // when the global Super Admin Gate bypass is active.
        abort_unless($user->hasRole('custom_admin'), 404);
        $this->authorize('resendInvitation', $user);
        abort_if($user->isActive(), 422, 'This team account is already active.');
        abort_if($user->suspended_at !== null, 422, 'Reactivate the account before resending its setup link.');

        try {
            $status = Password::sendResetLink(['email' => $user->email]);
        } catch (\Throwable $exception) {
            report($exception);
            $this->record($request->user(), 'team_invitation_delivery_failed', $user);

            return response()->json([
                'success' => false,
                'message' => 'Unable to send the setup link. Verify the mail configuration.',
                'data' => ['user' => $user->toSafeArray(), 'invitation_sent' => false],
            ], 503);
        }

        $mailWasActuallyDispatched = $status === Password::RESET_LINK_SENT
            && config('mail.default') !== 'log';

        if ($mailWasActuallyDispatched) {
            $this->record($request->user(), 'team_invitation_resent', $user);
            return response()->json([
                'success' => true,
                'message' => 'Password setup link sent.',
                'data' => ['user' => $user->toSafeArray(), 'invitation_sent' => true],
            ]);
        }

        $message = $status === Password::RESET_THROTTLED
            ? 'Please wait before requesting another setup link.'
            : 'The account is unchanged, but no email was delivered. Verify mail configuration and retry.';
        $this->record($request->user(), 'team_invitation_not_delivered', $user, [
            'password_broker_status' => (string) $status,
            'mail_driver' => (string) config('mail.default'),
        ]);

        return response()->json([
            'success' => false,
            'message' => $message,
            'data' => ['user' => $user->toSafeArray(), 'invitation_sent' => false],
        ], $status === Password::RESET_THROTTLED ? 429 : 503);
    }

    public function updatePermissions(Request $request, User $user): JsonResponse
    {
        // Team management must never mutate a Super Admin account, including
        // when the global Super Admin Gate bypass is active.
        abort_unless($user->hasRole('custom_admin'), 404);
        $this->authorize('updatePermissions', $user);

        $validated = $request->validate([
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string', 'distinct', \Illuminate\Validation\Rule::in(PermissionCatalog::slugs())],
        ]);

        abort_unless(\Illuminate\Support\Facades\Gate::allows('grantPermissions', [$user, array_values($validated['permissions'])]), 403);

        DB::transaction(function () use ($user, $validated, $request): void {
            $user->syncPermissions(array_values($validated['permissions']), $request->user());
            $this->record($request->user(), 'team_permissions_updated', $user, ['permissions' => $user->permissions]);
        });

        return response()->json(['success' => true, 'data' => $user->fresh()->toSafeArray()]);
    }

    public function updateStatus(Request $request, User $user): JsonResponse
    {
        // Team management must never mutate a Super Admin account, including
        // when the global Super Admin Gate bypass is active.
        abort_unless($user->hasRole('custom_admin'), 404);
        $this->authorize('updateStatus', $user);

        $validated = $request->validate(['is_active' => ['required', 'boolean']]);

        DB::transaction(function () use ($user, $validated, $request): void {
            $wasActive = $user->isActive();
            $user->is_active = (bool) $validated['is_active'];
            $user->suspended_at = $user->is_active ? null : now();
            $user->save();

            if ($wasActive !== $user->isActive()) {
                $this->revokeUserSessions($user);
            }

            $this->record(
                $request->user(),
                $user->is_active ? 'team_member_activated' : 'team_member_suspended',
                $user
            );
        });

        return response()->json(['success' => true, 'data' => $user->fresh()->toSafeArray()]);
    }

    public function revokeSessions(Request $request, User $user): JsonResponse
    {
        // Team management must never mutate a Super Admin account, including
        // when the global Super Admin Gate bypass is active.
        abort_unless($user->hasRole('custom_admin'), 404);
        $this->authorize('revokeSessions', $user);

        DB::transaction(function () use ($user, $request): void {
            $this->revokeUserSessions($user);
            $this->record($request->user(), 'team_member_sessions_revoked', $user);
        });

        return response()->json(['success' => true, 'message' => 'Active sessions revoked.']);
    }

    private function revokeUserSessions(User $user): void
    {
        // auth_version also revokes sessions stored on disk, which cannot be
        // enumerated through the sessions database table.
        $user->bumpAuthVersion();
        $user->tokens()->delete();
        if (Schema::hasTable('sessions')) {
            DB::table('sessions')->where('user_id', $user->id)->delete();
        }
    }

    private function record(?User $actor, string $action, User $subject, array $metadata = []): void
    {
        AdminActivityLog::create([
            'actor_id' => $actor?->id,
            'action' => $action,
            'subject_type' => User::class,
            'subject_id' => $subject->id,
            'metadata' => $metadata,
            'created_at' => now(),
        ]);
    }
}
