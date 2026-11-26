<?php

namespace App\Policies;

use App\Models\Client;
use App\Models\MediaFile;
use App\Models\Project;
use App\Models\User;

class MediaFilePolicy
{
    private function hasAnyAdminPermission(User $user, array $permissions): bool
    {
        if (!$user->isActive()) {
            return false;
        }

        if ($user->hasRole('super_admin')) {
            return true;
        }

        return $user->hasAnyPermission($permissions);
    }

    public function viewAny(User $user): bool
    {
        if ($this->hasAnyAdminPermission($user, [
            'manage_settings', 'view_settings',
            'manage_clients', 'view_clients',
            'manage_projects', 'view_projects',
            'manage_portfolio', 'view_portfolio',
            'manage_messages', 'view_messages',
        ])) {
            return true;
        }

        return $user->isActive() && $user->hasRole('client');
    }

    public function view(User $user, MediaFile $mediaFile): bool
    {
        if ($mediaFile->isPublic()) {
            return $user->isActive();
        }

        if ($this->hasOwnerModulePermission($user, $mediaFile, 'view')) {
            return true;
        }

        return $this->clientOwnsMedia($user, $mediaFile);
    }

    public function uploadPublic(User $user): bool
    {
        return $this->hasAnyAdminPermission($user, [
            'manage_settings', 'manage_portfolio', 'create_portfolio', 'update_portfolio',
        ]);
    }

    public function uploadPrivate(User $user): bool
    {
        if ($this->hasAnyAdminPermission($user, [
            'manage_clients', 'create_clients', 'update_clients',
            'manage_projects', 'create_projects', 'update_projects',
            'manage_messages', 'create_messages',
        ])) {
            return true;
        }

        return $user->isActive() && $user->hasRole('client');
    }

    public function replace(User $user, MediaFile $mediaFile): bool
    {
        if ($mediaFile->isPublic()) {
            return $this->uploadPublic($user);
        }

        if ($this->hasOwnerModulePermission($user, $mediaFile, 'update')) {
            return true;
        }

        if ($mediaFile->owner_type === Project::class || $mediaFile->category === 'message_attachment') {
            return false;
        }

        return $this->clientOwnsMedia($user, $mediaFile)
            && (int) $mediaFile->uploaded_by === (int) $user->id;
    }

    public function delete(User $user, MediaFile $mediaFile): bool
    {
        if ($mediaFile->isPublic()) {
            return $this->uploadPublic($user);
        }

        if ($this->hasOwnerModulePermission($user, $mediaFile, 'delete')) {
            return true;
        }

        if ($mediaFile->owner_type === Project::class || $mediaFile->category === 'message_attachment') {
            return false;
        }

        return $this->clientOwnsMedia($user, $mediaFile)
            && (int) $mediaFile->uploaded_by === (int) $user->id
            && $mediaFile->category !== 'invoice';
    }

    /**
     * Private file permissions follow the module that owns the record. A grant
     * for Clients must not implicitly grant access to Project or Message files.
     */
    private function hasOwnerModulePermission(User $user, MediaFile $mediaFile, string $action): bool
    {
        if (!$user->isActive()) {
            return false;
        }

        if ($user->hasRole('super_admin')) {
            return true;
        }

        if ($mediaFile->category === 'message_attachment') {
            $module = 'messages';
        } elseif ($mediaFile->owner_type === Project::class) {
            $module = 'projects';
        } elseif ($mediaFile->owner_type === Client::class) {
            $module = 'clients';
        } else {
            return false;
        }

        return $user->hasPermissionTo($action . '_' . $module)
            || $user->hasPermissionTo('manage_' . $module);
    }

    private function clientOwnsMedia(User $user, MediaFile $mediaFile): bool
    {
        if (!$user->isActive() || !$user->hasRole('client')) {
            return false;
        }

        $client = Client::query()
            ->where('user_id', $user->id)
            ->where('account_status', 'active')
            ->first();
        if (!$client) {
            return false;
        }

        if ($mediaFile->owner_type === Client::class) {
            return (int) $mediaFile->owner_id === (int) $client->id;
        }

        if ($mediaFile->owner_type === Project::class && $mediaFile->owner_id !== null) {
            return Project::query()->whereKey($mediaFile->owner_id)
                ->where('client_id', $client->id)
                ->exists();
        }

        return false;
    }
}
