# Next Steps — Windows Local Setup

This package contains both the existing React/Vite frontend and a Laravel 12 backend scaffold. Run the two servers separately for local development.

## 1. Environment files

From the repository root in PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item laravel/.env.example laravel/.env
```

Open `laravel/.env` and set the actual MySQL username/password. Keep `DB_DATABASE=my_web`, matching the database already created for this project. The sample uses the `root` user with an empty password only as a local default; change it to match your environment.

Set:

```dotenv
APP_URL=http://127.0.0.1:8100
FRONTEND_URL=http://localhost:3000
FRONTEND_ORIGIN=http://localhost:3000
LARAVEL_API_URL=http://127.0.0.1:8100
AUTO_START_LARAVEL=false
```

Do not put private credentials in a `VITE_*` variable.

## 2. Install frontend dependencies

At repository root:

```powershell
npm install
```

This archive does not contain `node_modules` or `package-lock.json`; npm will resolve and create a lockfile for this local environment.

## 3. Install Laravel dependencies

```powershell
Set-Location laravel
composer install
php artisan key:generate
```

If the installed PHP version or extensions do not satisfy `composer.json`, stop and resolve the Composer diagnostic rather than forcing a platform override.

## 4. Inspect database migrations before running them

```powershell
php artisan migrate:status
```

Confirm the configured database is the intended `my_web` development database. The project owner should review the pending migrations before running:

```powershell
php artisan migrate
```

Then initialize the first administrator:

```powershell
php artisan app:initialize-super-admin
```

The command prompts for the name, email and password. There is no default administrator password.

## 5. Start Laravel

In the Laravel terminal:

```powershell
php artisan serve --host=127.0.0.1 --port=8100
```

The sample mail configuration uses `MAIL_MAILER=log`, so invitation and password-reset emails will be written to Laravel logs until a real mail provider is configured.

## 6. Start React/Express

Open a second terminal at the repository root:

```powershell
npm run dev
```

Open `http://localhost:3000`.

## 7. First checks

From the repository root:

```powershell
npm run lint
npm test
npm run build
```

From `laravel/`:

```powershell
php artisan route:list
php artisan test
```

If any command fails, retain the full error output. Do not use `migrate:fresh` as a generic fix.
