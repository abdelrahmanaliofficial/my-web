# Invoice Billing — Stage 08 Report

**Project:** Abdelrahman Ali — Personal Website and Client Portal  
**Baseline:** `my-web-project-files-stage-07.zip`  
**Stage:** 08 — Persistent invoice management  
**Scope:** Laravel invoice backend, invoice authorization/privacy, PDF rendering, React billing integration and tests.

## 1. Executive summary

The repository already contained invoice models, migrations, an invoice controller, a client invoice controller, a PDF service, billing routes and React billing screens. This stage retained those components and hardened the existing implementation rather than introducing a parallel billing module.

The delivered code now provides a clearer invoice lifecycle, sequential invoice-number allocation, authoritative server-side line-item totals, recorded offline/manual payments, safer status transitions, a client-safe invoice resource, authorized PDF downloads and currency-aware dashboard totals.

This is **invoice tracking only**. No payment gateway or card-data collection was added.

## 2. Changes implemented

### Backend and database

- Added `2026_01_10_000100_create_invoice_number_sequences_table.php` to reserve yearly invoice numbers under a database row lock. Existing `invoice_number` values remain protected by the invoice table's unique index; the generator also scans existing numbers for the current year so older invoices are not followed by a duplicate sequence.
- Updated `Invoice` monetary helpers and relation recalculation to use integer minor units for totals/balances, preserve `draft` and `cancelled` states, and mark an invoice overdue only when its due-date calendar day is earlier than today.
- Updated invoice create/edit flows so the backend computes totals from line items instead of trusting a client-supplied total. Project/client relationships and issue/due dates are validated.
- Added row locks and repeat authorization/state checks for draft editing, issuing, status changes and payment recording to reduce race conditions between concurrent invoice operations.
- Payment recording checks the remaining balance while the invoice is locked, preventing concurrent requests from recording payments above the outstanding balance.
- Added explicit rejection for common card-number, CVV/security-code and expiry fields. Payment methods remain limited to the existing offline/manual methods (`bank_transfer`, `wire`, `cash`, `check`, `other`).
- Prevented cancellation or deletion when payment history exists. Draft/cancelled invoices with payment records cannot be deleted.
- Added a limited `/api/invoice-options` endpoint for administrators who have `create_billing` or `update_billing`, allowing the invoice form to retrieve client/project options without requiring access to the broader client-management module.

### Authorization and client privacy

- Administrative invoice endpoints are for authorized administrators with the appropriate billing permissions.
- Client invoice endpoints derive the client profile from the authenticated Sanctum user; the browser's `client_id` is not used to establish ownership.
- Clients cannot access administrative invoice detail/payment routes, including for their own invoices.
- Client invoice lists hide drafts and use `ClientInvoiceResource`, an allow-list that deliberately omits invoice internal notes, creator IDs, payment notes and staff recorder identities.
- Client download and payment-history endpoints enforce invoice ownership before returning data.

### PDF output

- Invoice PDF rendering reads the saved site brand name, appearance color and logo reference from the existing `settings` table.
- A logo is embedded only when its URL resolves to an allowed image on the configured public media disk. Absolute URLs must match that disk’s configured origin; the file is retrieved through the Laravel storage driver rather than fetching an arbitrary URL.
- PDF output includes the actual invoice/client/project data, line items, totals, balance and recorded payment history.
- `dompdf/dompdf` is declared by the Laravel Composer manifest. The fallback PDF generator remains available if Dompdf is not loaded, but full branded HTML/PDF rendering requires Composer dependencies to be installed.

### React integration

- `BillingContext` continues using the shared `apiClient` and the existing Laravel endpoints for admin/client invoice lists, details, payment history, mutations and PDF downloads.
- The billing form now retrieves its minimal client/project options from `/api/invoice-options`, so a custom administrator with billing permissions does not need `view_clients` merely to create an invoice.
- Billing summary totals are grouped by currency rather than incorrectly adding EGP, USD, EUR, etc. into one combined figure.
- The billing context clears previously loaded invoices before fetching a new account's records and on fetch failure, reducing the risk of stale invoice information remaining visible after an account switch.
- Existing billing and client invoice UI was preserved; no visual redesign was included in this stage.

## 3. Files changed

- `laravel/app/Http/Controllers/Api/InvoiceController.php`
- `laravel/app/Http/Controllers/Api/ClientInvoiceController.php`
- `laravel/app/Http/Resources/ClientInvoiceResource.php` (new)
- `laravel/app/Models/Invoice.php`
- `laravel/app/Policies/InvoicePolicy.php`
- `laravel/app/Services/InvoicePdfService.php`
- `laravel/database/migrations/2026_01_10_000100_create_invoice_number_sequences_table.php` (new)
- `laravel/routes/billing_api.php`
- `laravel/tests/Feature/InvoiceBillingTest.php`
- `src/contexts/BillingContext.tsx`
- `src/pages/dashboard/BillingDashboard.tsx`
- `src/types/billing.ts`
- `tests/billing.test.ts`
- `docs/INVOICE_BILLING_STAGE_08_REPORT.md` (new)
- `docs/INVOICE_BILLING_API.md` (new)
- `docs/PROJECT_AUDIT_AND_CHANGELOG.md` (updated)

## 4. Migrations and local database impact

One new additive migration was added:

`2026_01_10_000100_create_invoice_number_sequences_table.php`

It creates the `invoice_number_sequences` table if it does not exist. It does not drop or rebuild the existing invoice, invoice-item or payment tables. No destructive migration command is required.

After copying the Stage 08 files into the local project, run `php artisan migrate:status` and then `php artisan migrate` from the Laravel directory. Do **not** run `migrate:fresh`.

## 5. Tests and verification

| Check | Result | Notes |
|---|---|---|
| PHP syntax | **PASS** | 124 PHP files passed `php -l` with zero syntax errors. |
| TypeScript/TSX syntax | **PASS** | The five touched billing/context/UI/test files passed TypeScript transpilation syntax checks. `src/types/billing.ts` also passed a standalone strict type-check. This is not a full project type-check. |
| Billing helper smoke test | **PASS** | Verified per-currency summary grouping and rejection of a prohibited card-expiry field using the compiled helper module. |
| ZIP integrity | **PASS** | Archive integrity verified after packaging. |
| Full TypeScript check (`npm run lint`) | **BLOCKED** | `node_modules` is absent in the packaging environment; TypeScript reports missing React/Express/Vite and Node package/type declarations. |
| Frontend test suite (`npm test`) | **BLOCKED** | `tsx` is not installed because `node_modules` is absent. |
| Laravel feature tests | **BLOCKED** | `laravel/vendor/autoload.php` is absent in the packaging environment, so Artisan/PHPUnit cannot bootstrap here. |
| MySQL migration and transaction tests | **NOT RUN** | No live connection to the owner's local MySQL service is available in this environment. |
| Browser/session/client isolation tests | **NOT RUN** | Requires the user's local app, installed dependencies, database and authenticated test accounts. |
| PDF rendering with Dompdf | **NOT RUN** | PDF tests were added/updated, but Composer dependencies are not installed in this packaging environment. |

`InvoiceBillingTest.php` now contains coverage for invoice numbering, draft editing/issuing, payments, prohibited card data, PDF output, client isolation/privacy, invoice-options permission scope, calendar-date overdue logic and local saved branding. These tests are present but must be run locally before treating them as passed.

## 6. Local installation and verification

1. Back up the current project folder and database.
2. Extract this Stage 08 ZIP over the project root, preserving the local root `.env` and `laravel/.env` files.
3. From `laravel/`, run:

   ```powershell
   composer install
   php artisan config:clear
   php artisan migrate:status
   php artisan migrate
   php artisan test --filter=InvoiceBillingTest
   ```

4. From the repository root, run:

   ```powershell
   npm install
   npm run lint
   npm test
   npm run build
   ```

5. In the local app, test creating a draft invoice, editing it, issuing it, recording partial and final payments, downloading its PDF, and opening the same invoice under the associated client account. Also test that a second client receives `403` for another client's invoice and PDF.

Do not replace local `.env` files with examples. Do not use `migrate:fresh` or delete invoice/payment records.

## 7. Remaining runtime prerequisites

- The new invoice-number sequence migration must be applied to the local `my_web` database.
- Composer dependencies, including Dompdf, must be installed locally.
- Frontend dependencies must be installed locally.
- `settings` should contain the current saved brand values; the PDF service uses safe defaults if these are absent.
- A real mail provider is not required for invoice creation/payment tracking. This stage does not send invoice emails or integrate a payment provider.

## 8. Completion boundary

The invoice feature is implemented in source for the scope above. It is **not certified production-ready** until the local Laravel feature tests, MySQL migration, frontend checks and browser/client-isolation scenarios pass on the user's configured environment.
