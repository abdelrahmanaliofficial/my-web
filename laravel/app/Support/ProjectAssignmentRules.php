<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Shared database-backed validation rules for project assignment fields.
 * Clients must be assignable account profiles; staff assignments must point
 * to active administrative users, never clients or suspended accounts.
 */
final class ProjectAssignmentRules
{
    public static function assignableClient(): mixed
    {
        return Rule::exists('clients', 'id')
            ->where(fn ($query) => $query->whereIn('account_status', ['invited', 'active']));
    }

    public static function assignableClientForUpdate(?int $currentClientId): mixed
    {
        return Rule::exists('clients', 'id')->where(function ($query) use ($currentClientId): void {
            $query->whereIn('account_status', ['invited', 'active']);
            if ($currentClientId !== null) {
                $query->orWhere('id', $currentClientId);
            }
        });
    }

    public static function activeTeamMember(): mixed
    {
        return Rule::exists('users', 'id')->where(function ($query): void {
            $query->where('is_active', true)
                ->whereNull('suspended_at')
                ->whereIn('role_id', DB::table('roles')
                    ->select('id')
                    ->whereIn('slug', ['super_admin', 'custom_admin']));
        });
    }

    /** Allow an unchanged existing assignee while preventing new inactive assignments. */
    public static function activeTeamMemberForUpdate(?int $currentAssigneeId): mixed
    {
        return Rule::exists('users', 'id')->where(function ($query) use ($currentAssigneeId): void {
            $query->where(function ($eligible) use ($currentAssigneeId): void {
                $eligible->where(function ($active) {
                    $active->where('is_active', true)
                        ->whereNull('suspended_at')
                        ->whereIn('role_id', DB::table('roles')
                            ->select('id')
                            ->whereIn('slug', ['super_admin', 'custom_admin']));
                });

                if ($currentAssigneeId !== null) {
                    $eligible->orWhere('id', $currentAssigneeId);
                }
            });
        });
    }
}
