<?php

namespace App\Policies;

use App\Models\Invoice;
use App\Models\User;

class InvoicePolicy
{
    private function isActiveUser(User $user): bool
    {
        return $user->isActive();
    }

    private function hasBillingPermission(User $user, string $permission): bool
    {
        return $this->isActiveUser($user)
            && ($user->hasRole('super_admin') || $user->hasPermissionTo($permission));
    }

    private function canManageBilling(User $user, string $action): bool
    {
        return $this->hasBillingPermission($user, $action . '_billing')
            || $this->hasBillingPermission($user, 'manage_billing');
    }

    public function viewAny(User $user): bool
    {
        return $this->canManageBilling($user, 'view');
    }

    public function options(User $user): bool
    {
        return $this->canManageBilling($user, 'create')
            || $this->canManageBilling($user, 'update');
    }

    /** Administrative invoice routes are intentionally admin-only. */
    public function view(User $user, Invoice $invoice): bool
    {
        return $this->viewAny($user);
    }

    /** Client access is limited to the dedicated client invoice endpoints. */
    public function viewForClient(User $user, Invoice $invoice): bool
    {
        if (!$this->isActiveUser($user) || !$user->hasRole('client') || $invoice->status === 'draft') {
            return false;
        }

        $invoice->loadMissing('client');

        return $invoice->client !== null
            && $invoice->client->account_status === 'active'
            && (int) $invoice->client->user_id === (int) $user->id;
    }

    public function create(User $user): bool
    {
        return $this->canManageBilling($user, 'create');
    }

    public function update(User $user, Invoice $invoice): bool
    {
        return $this->canManageBilling($user, 'update');
    }

    public function issue(User $user, Invoice $invoice): bool
    {
        return $this->update($user, $invoice);
    }

    public function recordPayment(User $user, Invoice $invoice): bool
    {
        return $this->update($user, $invoice);
    }

    public function delete(User $user, Invoice $invoice): bool
    {
        return $this->canManageBilling($user, 'delete');
    }

    public function downloadPdf(User $user, Invoice $invoice): bool
    {
        return $this->view($user, $invoice);
    }
}
