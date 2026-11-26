<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Hash;

class InitializeSuperAdmin extends Command
{
    protected $signature = 'app:initialize-super-admin';
    protected $description = 'Create the first Super Admin account through an interactive, one-time setup.';

    public function handle(): int
    {
        if (User::query()->whereHas('roleRecord', fn ($query) => $query->where('slug', 'super_admin'))->exists()) {
            $this->error('A Super Admin already exists. This command is one-time only.');
            return self::FAILURE;
        }

        $name = trim((string) $this->ask('Super Admin full name'));
        $email = mb_strtolower(trim((string) $this->ask('Super Admin email')));
        if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $this->error('A valid name and email are required.');
            return self::INVALID;
        }
        if (User::query()->where('email', $email)->exists()) {
            $this->error('This email is already registered.');
            return self::INVALID;
        }

        $password = (string) $this->secret('Choose a strong password (minimum 12 characters)');
        $confirmation = (string) $this->secret('Confirm the password');
        if (strlen($password) < 12 || !hash_equals($password, $confirmation)) {
            $this->error('The passwords must match and contain at least 12 characters.');
            return self::INVALID;
        }

        User::create([
            'name' => $name,
            'email' => $email,
            'password' => Hash::make($password),
            'role' => 'super_admin',
            // Super Admin access is derived from the role, not a wildcard permission.
            'is_active' => true,
            'email_verified_at' => now(),
            'suspended_at' => null,
        ]);

        $this->info('The initial Super Admin account has been created. Store the credentials securely.');
        return self::SUCCESS;
    }
}
