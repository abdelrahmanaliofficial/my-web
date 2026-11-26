<?php

require __DIR__ . '/vendor/autoload.php';

$app = require __DIR__ . '/bootstrap/app.php';
$app->make(Illuminate\Contracts\Console\Kernel::class)->bootstrap();

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

$email = 'admin@gmail.com';

$user = User::where('email', $email)
    ->whereHas('role', function ($query) {
        $query->where('slug', 'super_admin');
    })
    ->first();

if (!$user) {
    exit("Super Admin account not found.\n");
}

echo "Account: {$user->name} ({$user->email})\n";

echo "Enter new password: ";
$password = trim(fgets(STDIN));

echo "Confirm new password: ";
$confirmation = trim(fgets(STDIN));

if (strlen($password) < 8) {
    exit("Password must be at least 8 characters.\n");
}

if (!hash_equals($password, $confirmation)) {
    exit("Passwords do not match.\n");
}

DB::transaction(function () use ($user, $password) {
    $user->forceFill([
        'password' => Hash::make($password),
        'auth_version' => (int) $user->auth_version + 1,
        'remember_token' => Str::random(60),
    ])->save();
});

echo "SUCCESS: Super Admin password updated.\n";