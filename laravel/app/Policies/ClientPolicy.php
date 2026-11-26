<?php

namespace App\Policies;

use App\Models\Client;
use App\Models\User;

class ClientPolicy
{
    private function isActiveUser(User $user): bool
    {
        return $user->isActive();
    }

    private function hasAdminPermission(User $user, string $permission): bool
    {
        return $this->isActiveUser($user)
            && ($user->hasRole('super_admin') || $user->hasPermissionTo($permission));
    }

    public function viewAny(User $user): bool
    {
        return $this->hasAdminPermission($user, 'view_clients')
            || $this->hasAdminPermission($user, 'manage_clients');
    }

    /** Administrative client details may contain activity and project metadata. */
    public function view(User $user, Client $client): bool
    {
        return $this->viewAny($user);
    }

    /** Clients use a separate, reduced self-profile endpoint rather than the admin detail endpoint. */
    public function viewOwnProfile(User $user, Client $client): bool
    {
        return $this->isActiveUser($user)
            && $user->hasRole('client')
            && $client->account_status === 'active'
            && $client->user_id !== null
            && (int) $client->user_id === (int) $user->id;
    }

    /** Changing the login email invalidates sessions and requires a new invitation. */
    public function changeEmail(User $user, Client $client): bool
    {
        return $this->hasAdminPermission($user, 'manage_clients');
    }

    public function create(User $user): bool
    {
        return $this->hasAdminPermission($user, 'create_clients')
            || $this->hasAdminPermission($user, 'manage_clients');
    }

    public function update(User $user, Client $client): bool
    {
        return $this->hasAdminPermission($user, 'update_clients')
            || $this->hasAdminPermission($user, 'manage_clients');
    }

    public function updateOwn(User $user, Client $client): bool
    {
        return $this->isActiveUser($user)
            && $user->hasRole('client')
            && $client->user_id !== null
            && (int) $client->user_id === (int) $user->id
            && $client->account_status === 'active';
    }

    public function manageStatus(User $user, Client $client): bool
    {
        return $this->hasAdminPermission($user, 'manage_clients');
    }

    /** Invitation privileges are separate from basic client creation. */
    public function inviteAny(User $user): bool
    {
        return $this->hasAdminPermission($user, 'manage_clients');
    }

    public function invite(User $user, Client $client): bool
    {
        return $this->hasAdminPermission($user, 'manage_clients');
    }

    public function revokeAccess(User $user, Client $client): bool
    {
        return $this->hasAdminPermission($user, 'manage_clients');
    }

    public function delete(User $user, Client $client): bool
    {
        return $this->hasAdminPermission($user, 'delete_clients')
            || $this->hasAdminPermission($user, 'manage_clients');
    }
}
