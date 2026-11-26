# Invoice Billing API — Stage 08

All endpoints are served by Laravel under `/api` and require a valid Laravel Sanctum session unless explicitly stated otherwise. The authenticated account must be active. Mutating requests must follow the application's CSRF flow.

## Administrative invoice endpoints

Access is controlled by `InvoicePolicy` and the normalized billing permissions.

| Method | Endpoint | Permission | Purpose |
|---|---|---|---|
| GET | `/api/invoice-options` | `create_billing` or `update_billing` (or Super Admin) | Minimal active client/project options for invoice forms. |
| GET | `/api/invoices` | `view_billing` or `manage_billing` | List/search/filter invoices. |
| POST | `/api/invoices` | `create_billing` or `manage_billing` | Create a draft or issue immediately. |
| GET | `/api/invoices/{invoice}` | `view_billing` or `manage_billing` | Retrieve the full administrative invoice record. |
| PUT | `/api/invoices/{invoice}` | `update_billing` or `manage_billing` | Edit a draft invoice only. |
| POST | `/api/invoices/{invoice}/issue` | `update_billing` or `manage_billing` | Issue a valid draft invoice. |
| PUT | `/api/invoices/{invoice}/status` | `update_billing` or `manage_billing` | Apply an allowed status transition. |
| POST | `/api/invoices/{invoice}/payments` | `update_billing` or `manage_billing` | Record a manual/offline payment. |
| GET | `/api/invoices/{invoice}/payments` | `view_billing` or `manage_billing` | Retrieve full administrative payment history. |
| GET | `/api/invoices/{invoice}/pdf` | `view_billing` or `manage_billing` | Download the administrative invoice PDF. |
| DELETE | `/api/invoices/{invoice}` | `delete_billing` or `manage_billing` | Delete only an eligible draft/cancelled invoice with no payment history. |

`manage_billing` grants the module's canonical actions through the RBAC policy. Custom Admin permissions are still checked server-side.

## Client invoice endpoints

The client identity is resolved from the authenticated user and the related active client profile. A caller-supplied `client_id` is never used as the authorization source.

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/client/invoices` | List the authenticated client's non-draft invoices. |
| GET | `/api/client/invoices/{invoice}` | Retrieve one invoice owned by the authenticated client. |
| GET | `/api/client/invoices/{invoice}/payments` | Retrieve the client's safe payment history. |
| GET | `/api/client/invoices/{invoice}/pdf` | Download an owned invoice PDF. |

Client responses use an explicit allow-list and omit internal invoice notes, creator IDs, payment notes and staff recorder identities. Clients cannot use administrative invoice detail/payment routes.

## Invoice payloads

### Create

```json
{
  "client_id": 12,
  "project_id": 34,
  "description": "Marketing strategy phase 1",
  "currency": "EGP",
  "issue_date": "2026-11-26",
  "due_date": "2026-12-10",
  "issue_immediately": false,
  "items": [
    { "description": "Strategy development", "quantity": 1, "unit_price": 5000 }
  ]
}
```

The backend calculates `amount` from line items. If no line items are submitted, a positive `amount` is required. The project must belong to the selected client. The client account must be active for invoice creation.

### Record a manual payment

```json
{
  "amount": 1500,
  "payment_method": "bank_transfer",
  "paid_at": "2026-11-26T12:00:00",
  "notes": "Bank transfer reference supplied by client"
}
```

Allowed payment methods: `bank_transfer`, `wire`, `cash`, `check`, `other`. Card numbers, PAN, CVV/CVC/security codes and expiry fields are prohibited. This API is not a payment gateway.

## Statuses and transitions

Statuses: `draft`, `issued`, `partially_paid`, `paid`, `overdue`, `cancelled`.

- Draft invoices can be edited.
- Issuing requires a positive total.
- Payment entries are recorded only for issued/overdue/partially-paid invoices with a positive remaining balance.
- Payment amounts cannot exceed the remaining balance; the invoice row is locked during payment recording.
- Paid invoices cannot receive additional payments or be cancelled/deleted.
- Invoices with any payment history cannot be deleted.
- An unpaid issued invoice can be marked overdue only after its due-date calendar day has passed.
- A cancelled invoice cannot be reopened through the ordinary status endpoint.

Invoice numbers use `INV-YYYY-NNNN` and a database sequence row to serialize number allocation per year. The `invoice_number` unique index remains the final database safeguard.

## PDF branding

The PDF service reads appearance settings from the existing `settings` table and uses a saved `brand_name`/`site_name` if present, otherwise Laravel `APP_NAME`. A logo is embedded only when it resolves to an allowed image on the configured public media disk. Absolute URLs must match the configured disk origin; the file is retrieved through the Laravel storage driver, not fetched from an arbitrary URL.
