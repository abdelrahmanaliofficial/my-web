<?php

namespace App\Policies;

use App\Models\Project;
use App\Models\User;

class ProjectPolicy
{
    private function hasAdminPermission(User $user, string $permission): bool
    {
        return $user->isActive()
            && ($user->hasRole('super_admin') || $user->hasPermissionTo($permission));
    }

    private function isOwnedByActiveClient(User $user, Project $project): bool
    {
        if (!$user->isActive() || !$user->hasRole('client')) {
            return false;
        }

        $project->loadMissing('client');

        return $project->client !== null
            && $project->client->account_status === 'active'
            && (int) $project->client->user_id === (int) $user->id;
    }

    public function viewAny(User $user): bool
    {
        return $this->hasAdminPermission($user, 'view_projects')
            || $this->hasAdminPermission($user, 'manage_projects');
    }

    /**
     * Admin project detail endpoints may include private notes and hidden tasks.
     * Client access must use the dedicated ClientProjectController serializer.
     */
    public function viewAdminDetails(User $user, Project $project): bool
    {
        return $this->hasAdminPermission($user, 'view_projects')
            || $this->hasAdminPermission($user, 'manage_projects');
    }

    /**
     * Project assignment options expose only minimal active client/staff fields.
     * They are available to administrators who can create or update projects,
     * even when they do not have general Client or Team listing permissions.
     */
    public function viewAssignmentOptions(User $user): bool
    {
        return $this->hasAdminPermission($user, 'create_projects')
            || $this->hasAdminPermission($user, 'update_projects')
            || $this->hasAdminPermission($user, 'manage_projects');
    }

    public function view(User $user, Project $project): bool
    {
        return $this->viewAdminDetails($user, $project)
            || $this->isOwnedByActiveClient($user, $project);
    }

    public function create(User $user): bool
    {
        return $this->hasAdminPermission($user, 'create_projects')
            || $this->hasAdminPermission($user, 'manage_projects');
    }

    public function update(User $user, Project $project): bool
    {
        return $this->hasAdminPermission($user, 'update_projects')
            || $this->hasAdminPermission($user, 'manage_projects');
    }

    public function delete(User $user, Project $project): bool
    {
        return $this->hasAdminPermission($user, 'delete_projects')
            || $this->hasAdminPermission($user, 'manage_projects');
    }

    public function respondToApproval(User $user, Project $project): bool
    {
        return $this->isOwnedByActiveClient($user, $project);
    }
}
