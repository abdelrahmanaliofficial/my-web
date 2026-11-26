# Abdelrahman Ali — Website and Client Portal

This repository contains the React/Vite frontend and the Laravel/MySQL backend source for the Abdelrahman Ali personal website and client portal.

## Architecture

- Frontend: React 19, TypeScript and Vite.
- Frontend/Express runtime: `server.ts` (serves the application and proxies `/api`, `/sanctum` and `/storage` to Laravel).
- Business backend: Laravel REST API in `laravel/`.
- Database: MySQL (configured as `DB_DATABASE=my_web` in `laravel/.env.example`).
- Authentication: Laravel Sanctum session cookies and CSRF protection.
- Files: Laravel Storage; public website media and private client files use separate disks.

Express does not own business data. Laravel/MySQL is the source of truth. Laravel is intentionally not auto-migrated or key-generated when the Express server starts.

## Requirements

Install Node.js/npm, PHP (8.2+), Composer, MySQL, and the PHP extensions required by Laravel and the project (`pdo_mysql`, `mbstring`, `openssl`, `fileinfo`, `ctype`, `json`, `tokenizer`).

## Local setup (Windows / PowerShell)

### 1. Configure the Laravel backend

```powershell
Copy-Item laravel/.env.example laravel/.env
cd laravel
composer install
php artisan key:generate
```

Open `laravel/.env` and set the MySQL credentials for the database you created. The configured database name is `my_web`; keep that exact name if it matches your existing MySQL database. Keep Laravel `APP_URL` at `http://127.0.0.1:8100`, while `FRONTEND_URL` and `FRONTEND_ORIGIN` should point to the browser-facing Express origin `http://localhost:3000`. Keep `SESSION_SECURE_COOKIE=false` for local HTTP only; set it to `true` under HTTPS in production.

Before migrating, verify the active database target. For a new empty development database, inspect the pending migrations and then run:

```powershell
php artisan migrate:status
php artisan migrate
php artisan app:initialize-super-admin
php artisan storage:link
php artisan serve --host=127.0.0.1 --port=8100
```

`app:initialize-super-admin` prompts for the first administrator credentials and refuses to create a second Super Admin. Do not run `migrate:fresh` against a database that may contain data.

The example mailer uses `MAIL_MAILER=log`; password reset and invitation emails are therefore written to Laravel logs during local setup, not delivered to a real inbox. Configure a real SMTP/provider before inviting real customers.

### 2. Configure the frontend/Express runtime

Open a second terminal at the repository root:

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

The root `.env` should point to the Laravel server:

```dotenv
LARAVEL_API_URL=http://127.0.0.1:8100
FRONTEND_ORIGIN=http://localhost:3000
AUTO_START_LARAVEL=false
```

Keep `AUTO_START_LARAVEL=false` and start Laravel in the first terminal. Automatic startup is optional and never runs database migrations, `key:generate`, or `storage:link`.

The frontend is normally available at `http://localhost:3000`.

## Tests and checks

From the repository root:

```powershell
npm run lint
npm test
npm run build
```

For backend tests:

```powershell
cd laravel
php artisan test
```

The frontend `npm test` script runs the seven test files that are actually present under `tests/`. Laravel tests use an isolated in-memory SQLite connection when the `pdo_sqlite` extension is installed. The application itself uses MySQL.

## Environment files

There are two separate environment files:

- Root `.env`: Express/Vite runtime settings and the Laravel API upstream URL.
- `laravel/.env`: Laravel app key, MySQL credentials, Sanctum/session, mail and storage settings.

Never commit either real `.env` file. Only `.env.example` files belong in source control. Never share service-account keys, SMTP passwords, OAuth refresh tokens or API keys.

## Current implementation limits

See `docs/PROJECT_AUDIT_AND_CHANGELOG.md` for the evidence-based comparison of existing modules, edits in this package, tests that could be run in the review environment, and remaining work. The presence of a route or UI does not mean a feature has been verified against a live database/provider.
