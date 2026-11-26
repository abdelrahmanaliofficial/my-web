<?php

namespace App\Policies;

use App\Authorization\PermissionCatalog;
use App\Models\User;

/**
 * Authorization rules for team-account administration. Super Admin access is
 * also supported by the application's active-account Gate::before hook.
 * Delegated Custom Admins can only manage other Custom Admin accounts and may
 * never edit their own account or grant permissions they do not possess.
 */
class TeamMemberPolicy
{
    private function isActive(User $actor): bool
    {
        return $actor->isActive();
    }

    private function isDelegatedManager(User $actor, string $permission): bool
    {
        return $this->isActive($actor)
            && $actor->hasRole('custom_admin')
            && $actor->hasPermissionTo($permission);
    }

    private function canManageTarget(User $actor, User $target): bool
    {
        return (int) $actor->id !== (int) $target->id
            && $target->hasRole('custom_admin');
    }

    public function viewAny(User $actor): bool
    {
        return $this->isActive($actor)
            && ($actor->hasRole('super_admin') || $actor->hasPermissionTo('view_team'));
    }

    public function viewPermissionCatalog(User $actor): bool
    {
        return $this->viewAny($actor);
    }

    public function viewActivity(User $actor): bool
    {
        return $this->viewAny($actor);
    }

    public function create(User $actor): bool
    {
        return $this->isActive($actor)
            && ($actor->hasRole('super_admin') || $actor->hasPermissionTo('create_team'));
    }

    /** @param list<string> $permissions */
    public function createWithPermissions(User $actor, array $permissions): bool
    {
        if (!$this->create($actor)) {
            return false;
        }

        if ($actor->hasRole('super_admin')) {
            return true;
        }

        if ($permissions === []) {
            return true;
        }

        if (!$actor->hasPermissionTo('manage_team')) {
            return false;
        }

        foreach ($permissions as $permission) {
            if (!is_string($permission)
                || !PermissionCatalog::has($permission)
                || !$actor->hasPermissionTo($permission)) {
                return false;
            }
        }

        return true;
    }

    public function updatePermissions(User $actor, User $target): bool
    {
        return $this->isActive($actor)
            && $this->canManageTarget($actor, $target)
            && ($actor->hasRole('super_admin') || $this->isDelegatedManager($actor, 'manage_team'));
    }

    /** @param list<string> $permissions */
    public function grantPermissions(User $actor, User $target, array $permissions): bool
    {
        if (!$this->updatePermissions($actor, $target)) {
            return false;
        }

        if ($actor->hasRole('super_admin')) {
            return true;
        }

        foreach ($permissions as $permission) {
            if (!is_string($permission)
                || !PermissionCatalog::has($permission)
                || !$actor->hasPermissionTo($permission)) {
                return false;
            }
        }

        return true;
    }

    public function updateStatus(User $actor, User $target): bool
    {
        return $this->isActive($actor)
            && $this->canManageTarget($actor, $target)
            && ($actor->hasRole('super_admin') || $this->isDelegatedManager($actor, 'update_team'));
    }

    public function resendInvitation(User $actor, User $target): bool
    {
        return $this->updateStatus($actor, $target);
    }

    public function revokeSessions(User $actor, User $target): bool
    {
        return $this->updateStatus($actor, $target);
    }
}
