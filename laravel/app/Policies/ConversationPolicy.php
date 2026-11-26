<?php

namespace App\Policies;

use App\Models\Conversation;
use App\Models\User;

class ConversationPolicy
{
    private function hasMessagePermission(User $user, string $permission): bool
    {
        return $user->isActive()
            && ($user->hasRole('super_admin') || $user->hasPermissionTo($permission));
    }

    private function isOwnedByActiveClient(User $user, Conversation $conversation): bool
    {
        if (!$user->isActive() || !$user->hasRole('client')) {
            return false;
        }

        $conversation->loadMissing('client');

        return $conversation->client !== null
            && $conversation->client->account_status === 'active'
            && (int) $conversation->client->user_id === (int) $user->id;
    }

    /** Administrative collection access. Client accounts must use client-scoped endpoints. */
    public function viewAny(User $user): bool
    {
        return $this->hasMessagePermission($user, 'view_messages')
            || $this->hasMessagePermission($user, 'manage_messages');
    }

    public function create(User $user): bool
    {
        return $this->hasMessagePermission($user, 'create_messages')
            || $this->hasMessagePermission($user, 'manage_messages');
    }

    /** Admin-side view permission only; never grants a client access to admin routes. */
    public function view(User $user, Conversation $conversation): bool
    {
        return $this->viewAny($user);
    }

    /** Client-side view is explicit and verifies the authenticated profile owner. */
    public function viewOwn(User $user, Conversation $conversation): bool
    {
        return $this->isOwnedByActiveClient($user, $conversation);
    }

    /** Administrative message creation only. */
    public function sendMessage(User $user, Conversation $conversation): bool
    {
        if ($conversation->status !== 'open') {
            return false;
        }

        return $this->viewAny($user)
            && (
                $this->hasMessagePermission($user, 'create_messages')
                || $this->hasMessagePermission($user, 'update_messages')
                || $this->hasMessagePermission($user, 'manage_messages')
            );
    }

    /** Client-side reply is explicit and limited to that client's open conversation. */
    public function replyOwn(User $user, Conversation $conversation): bool
    {
        return $conversation->status === 'open'
            && $this->isOwnedByActiveClient($user, $conversation);
    }

    public function markRead(User $user, Conversation $conversation): bool
    {
        return $this->viewAny($user);
    }

    public function markReadOwn(User $user, Conversation $conversation): bool
    {
        return $this->isOwnedByActiveClient($user, $conversation);
    }

    public function archive(User $user, Conversation $conversation): bool
    {
        return $this->viewAny($user)
            && (
                $this->hasMessagePermission($user, 'update_messages')
                || $this->hasMessagePermission($user, 'manage_messages')
            );
    }

    public function reopen(User $user, Conversation $conversation): bool
    {
        return $this->archive($user, $conversation);
    }
}
