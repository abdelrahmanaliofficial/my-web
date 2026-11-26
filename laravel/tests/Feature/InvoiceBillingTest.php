<?php

namespace Tests\Feature;

use App\Models\Client;
use App\Models\Invoice;
use App\Models\InvoicePayment;
use App\Models\Project;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use App\Services\InvoicePdfService;
use Tests\TestCase;

class InvoiceBillingTest extends TestCase
{
    use RefreshDatabase;

    public function test_invoice_creation_numbering_draft_editing_issuing_and_payments_lifecycle(): void
    {
        $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
        $clientUser = User::factory()->create(['email' => 'client1@example.com', 'role' => 'client', 'is_active' => true]);
        $client = Client::create([
            'user_id' => $clientUser->id,
            'full_name' => 'Acme Holdings',
            'email' => 'client1@example.com',
            'company_name' => 'Acme Corp',
            'account_status' => 'active',
        ]);
        $project = Project::create([
            'client_id' => $client->id,
            'name' => 'Platform Rebuild',
            'service_category' => 'Engineering',
            'status' => 'in_progress',
        ]);

        // 1. Create draft invoice with line items; server computes authoritative amount (ignores spoofed amount)
        $createRes = $this->actingAs($admin)->postJson('/api/invoices', [
            'client_id' => $client->id,
            'project_id' => $project->id,
            'description' => 'Phase 1 Architecture & Setup',
            'currency' => 'USD',
            'amount' => 1.00, // Must be overridden by line items sum (2 * 500 + 1 * 250 = 1250)
            'items' => [
                ['description' => 'System Architecture', 'quantity' => 2, 'unit_price' => 500],
                ['description' => 'CI/CD Setup', 'quantity' => 1, 'unit_price' => 250],
            ],
        ])->assertCreated();

        $invoiceId = $createRes->json('data.id');
        $invNum1 = $createRes->json('data.invoice_number');
        $this->assertMatchesRegularExpression('/^INV-\d{4}-0001$/', $invNum1);
        $this->assertSame('draft', $createRes->json('data.status'));
        $this->assertEquals(1250.0, $createRes->json('data.amount'));

        // Second invoice receives next unique sequential number
        $createRes2 = $this->actingAs($admin)->postJson('/api/invoices', [
            'client_id' => $client->id,
            'currency' => 'USD',
            'amount' => 400,
            'description' => 'Retainer',
        ])->assertCreated();
        $invNum2 = $createRes2->json('data.invoice_number');
        $this->assertNotSame($invNum1, $invNum2);
        $this->assertMatchesRegularExpression('/^INV-\d{4}-0002$/', $invNum2);

        // 2. Draft invoice can be edited cleanly
        $this->actingAs($admin)->putJson("/api/invoices/{$invoiceId}", [
            'description' => 'Phase 1 Architecture + Security Audit',
            'items' => [
                ['description' => 'System Architecture', 'quantity' => 2, 'unit_price' => 500],
                ['description' => 'Security Hardening', 'quantity' => 1, 'unit_price' => 500],
            ],
        ])->assertOk()
          ->assertJsonPath('data.amount', 1500);

        // Draft invoice is hidden from client before issuing
        $this->actingAs($clientUser)->getJson('/api/client/invoices')
            ->assertOk()
            ->assertJsonCount(0, 'data');
        $this->actingAs($clientUser)->getJson("/api/client/invoices/{$invoiceId}")->assertForbidden();

        // 3. Issue draft invoice; editing after issuing is blocked (422)
        $this->actingAs($admin)->postJson("/api/invoices/{$invoiceId}/issue")
            ->assertOk()
            ->assertJsonPath('data.status', 'issued');

        $this->actingAs($admin)->putJson("/api/invoices/{$invoiceId}", [
            'description' => 'Tamper after issue',
        ])->assertStatus(422);

        // 4. Reject credit card fields & overpayment; record partial then final payment
        $this->actingAs($admin)->postJson("/api/invoices/{$invoiceId}/payments", [
            'amount' => 500,
            'payment_method' => 'bank_transfer',
            'card_number' => '4242424242424242',
            'cvv' => '123',
        ])->assertStatus(422);

        $this->actingAs($admin)->postJson("/api/invoices/{$invoiceId}/payments", [
            'amount' => 2000,
            'payment_method' => 'bank_transfer',
        ])->assertStatus(422);

        $this->actingAs($admin)->postJson("/api/invoices/{$invoiceId}/payments", [
            'amount' => 100,
            'payment_method' => 'bank_transfer',
            'card_expiry' => '12/29',
        ])->assertStatus(422);

        $this->actingAs($admin)->postJson("/api/invoices/{$invoiceId}/payments", [
            'amount' => 500,
            'payment_method' => 'bank_transfer',
            'notes' => 'Deposit wire #1',
        ])->assertCreated()
          ->assertJsonPath('data.status', 'partially_paid')
          ->assertJsonPath('data.paid_amount', 500)
          ->assertJsonPath('data.balance_due', 1000);

        $this->actingAs($admin)->postJson("/api/invoices/{$invoiceId}/payments", [
            'amount' => 1000,
            'payment_method' => 'wire',
            'notes' => 'Final settlement',
        ])->assertCreated()
          ->assertJsonPath('data.status', 'paid')
          ->assertJsonPath('data.paid_amount', 1500)
          ->assertJsonPath('data.balance_due', 0);

        // 5. PDF output contains %PDF-1.4 header, real invoice number, and client data
        $pdfRes = $this->actingAs($clientUser)->get("/api/client/invoices/{$invoiceId}/pdf");
        $pdfRes->assertOk();
        $this->assertStringContainsString('application/pdf', (string) $pdfRes->headers->get('Content-Type'));
        $content = $pdfRes->getContent();
        $this->assertStringStartsWith('%PDF-', $content);

        // Validate the real PDF source content independently of PDF compression/version.
        $pdfService = app(InvoicePdfService::class);
        $invoiceForPdf = Invoice::with(['client', 'project', 'items', 'payments'])->findOrFail($invoiceId);
        $html = $pdfService->renderHtml($invoiceForPdf, $pdfService->resolveBrandIdentity());
        $this->assertStringContainsString($invNum1, $html);
        $this->assertStringContainsString('Acme Holdings', $html);
    }

    public function test_enforces_two_client_isolation_and_billing_rbac(): void
    {
        $viewBillingAdmin = User::factory()->withPermissions(['view_billing'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);

        $clientUserA = User::factory()->create(['email' => 'a@example.com', 'role' => 'client', 'is_active' => true]);
        $clientA = Client::create([
            'user_id' => $clientUserA->id,
            'full_name' => 'Client Alpha',
            'email' => 'a@example.com',
            'account_status' => 'active',
        ]);

        $clientUserB = User::factory()->create(['email' => 'b@example.com', 'role' => 'client', 'is_active' => true]);
        $clientB = Client::create([
            'user_id' => $clientUserB->id,
            'full_name' => 'Client Beta',
            'email' => 'b@example.com',
            'account_status' => 'active',
        ]);

        $invoiceA = Invoice::create([
            'client_id' => $clientA->id,
            'description' => 'Alpha Invoice',
            'amount' => 900,
            'currency' => 'USD',
            'status' => 'issued',
            'issued_at' => now(),
        ]);

        $invoiceB = Invoice::create([
            'client_id' => $clientB->id,
            'description' => 'Beta Invoice',
            'amount' => 1200,
            'currency' => 'USD',
            'status' => 'issued',
            'issued_at' => now(),
            'notes' => 'ADMIN_ONLY_INVOICE_NOTE',
        ]);
        InvoicePayment::create([
            'invoice_id' => $invoiceB->id,
            'client_id' => $clientB->id,
            'recorded_by' => $viewBillingAdmin->id,
            'amount' => 100,
            'currency' => 'USD',
            'payment_method' => 'bank_transfer',
            'paid_at' => now(),
            'notes' => 'ADMIN_ONLY_PAYMENT_NOTE',
        ]);
        $invoiceB->refresh()->recalculateFromRelations();

        // View-only admin can read & download PDF, cannot create or record payments
        $this->actingAs($viewBillingAdmin)->getJson('/api/invoices')->assertOk();
        $this->actingAs($viewBillingAdmin)->get("/api/invoices/{$invoiceA->id}/pdf")->assertOk();
        $this->actingAs($viewBillingAdmin)->postJson('/api/invoices', [
            'client_id' => $clientA->id,
            'currency' => 'USD',
            'amount' => 100,
        ])->assertForbidden();
        $this->actingAs($viewBillingAdmin)->postJson("/api/invoices/{$invoiceA->id}/payments", [
            'amount' => 100,
            'payment_method' => 'cash',
        ])->assertForbidden();

        // Client A sees ONLY Invoice A even when passing ?client_id=clientB->id, and cannot view/download Invoice B
        $this->actingAs($clientUserA)
            ->getJson("/api/client/invoices?client_id={$clientB->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $invoiceA->id);

        $this->actingAs($clientUserA)->getJson("/api/client/invoices/{$invoiceB->id}")->assertForbidden();
        $this->actingAs($clientUserA)->get("/api/client/invoices/{$invoiceB->id}/pdf")->assertForbidden();
        $this->actingAs($clientUserA)->getJson("/api/client/invoices/{$invoiceB->id}/payments")->assertForbidden();

        // Clients must use the dedicated client endpoints; admin serializers expose internal notes.
        $clientInvoiceResponse = $this->actingAs($clientUserB)
            ->getJson("/api/client/invoices/{$invoiceB->id}")
            ->assertOk()
            ->assertJsonMissingPath('data.notes')
            ->assertJsonMissingPath('data.created_by')
            ->assertJsonMissingPath('data.payments.0.notes')
            ->assertJsonMissingPath('data.payments.0.recorded_by');
        $this->assertStringNotContainsString('ADMIN_ONLY_INVOICE_NOTE', $clientInvoiceResponse->getContent());
        $this->assertStringNotContainsString('ADMIN_ONLY_PAYMENT_NOTE', $clientInvoiceResponse->getContent());

        // A client cannot use administrative invoice detail/payment endpoints for even their own invoice.
        $this->actingAs($clientUserB)->getJson("/api/invoices/{$invoiceB->id}")->assertForbidden();
        $this->actingAs($clientUserB)->getJson("/api/invoices/{$invoiceB->id}/payments")->assertForbidden();

        // Client B cannot access Invoice A or any admin billing route
        $this->actingAs($clientUserB)->getJson("/api/client/invoices/{$invoiceA->id}")->assertForbidden();
        $this->actingAs($clientUserB)->get("/api/client/invoices/{$invoiceA->id}/pdf")->assertForbidden();
        $this->actingAs($clientUserB)->getJson('/api/invoices')->assertForbidden();
    }

    public function test_invoice_options_are_limited_to_authorized_billing_users_and_active_clients(): void
    {
        $creator = User::factory()->withPermissions(['create_billing'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);
        $viewer = User::factory()->withPermissions(['view_billing'])->create([
            'role' => 'custom_admin',
            'is_active' => true,
        ]);

        $activeUser = User::factory()->create(['role' => 'client', 'is_active' => true]);
        $activeClient = Client::create([
            'user_id' => $activeUser->id,
            'full_name' => 'Active Invoice Client',
            'email' => $activeUser->email,
            'account_status' => 'active',
        ]);
        $inactiveUser = User::factory()->create(['role' => 'client', 'is_active' => false]);
        Client::create([
            'user_id' => $inactiveUser->id,
            'full_name' => 'Suspended Invoice Client',
            'email' => $inactiveUser->email,
            'account_status' => 'suspended',
        ]);
        Project::create([
            'client_id' => $activeClient->id,
            'name' => 'Active Client Project',
            'service_category' => 'Consulting',
            'status' => 'in_progress',
        ]);

        $this->actingAs($creator)
            ->getJson('/api/invoice-options')
            ->assertOk()
            ->assertJsonCount(1, 'data.clients')
            ->assertJsonPath('data.clients.0.id', $activeClient->id)
            ->assertJsonCount(1, 'data.projects');

        $this->actingAs($viewer)->getJson('/api/invoice-options')->assertForbidden();
    }

    public function test_invoice_number_sequence_continues_after_existing_legacy_invoice_numbers(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-26 10:00:00'));
        try {
            $clientUser = User::factory()->create(['role' => 'client', 'is_active' => true]);
            $client = Client::create([
                'user_id' => $clientUser->id,
                'full_name' => 'Legacy Number Client',
                'email' => $clientUser->email,
                'account_status' => 'active',
            ]);

            Invoice::create([
                'invoice_number' => 'INV-2026-0012',
                'client_id' => $client->id,
                'amount' => 100,
                'currency' => 'EGP',
                'status' => 'draft',
            ]);

            $nextInvoice = Invoice::create([
                'client_id' => $client->id,
                'amount' => 250,
                'currency' => 'EGP',
                'status' => 'draft',
            ]);

            $this->assertSame('INV-2026-0013', $nextInvoice->invoice_number);
            $this->assertDatabaseHas('invoice_number_sequences', [
                'year' => 2026,
                'next_number' => 14,
            ]);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_overdue_status_uses_calendar_date_and_paid_or_cancelled_history_cannot_be_deleted(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-11-26 15:30:00'));
        try {
            $admin = User::factory()->create(['role' => 'super_admin', 'is_active' => true]);
            $clientUser = User::factory()->create(['role' => 'client', 'is_active' => true]);
            $client = Client::create([
                'user_id' => $clientUser->id,
                'full_name' => 'Due Date Client',
                'email' => $clientUser->email,
                'account_status' => 'active',
            ]);

            $dueToday = Invoice::create([
                'client_id' => $client->id,
                'amount' => 100,
                'currency' => 'EGP',
                'status' => 'issued',
                'issue_date' => '2026-11-01',
                'due_date' => '2026-11-26',
                'issued_at' => now(),
            ]);
            $dueToday->recalculateFromRelations();
            $this->assertSame('issued', $dueToday->fresh()->status);

            $pastDue = Invoice::create([
                'client_id' => $client->id,
                'amount' => 100,
                'currency' => 'EGP',
                'status' => 'issued',
                'issue_date' => '2026-11-01',
                'due_date' => '2026-11-25',
                'issued_at' => now(),
            ]);
            $pastDue->recalculateFromRelations();
            $this->assertSame('overdue', $pastDue->fresh()->status);

            $this->actingAs($admin)->putJson("/api/invoices/{$dueToday->id}/status", ['status' => 'overdue'])
                ->assertUnprocessable();

            $this->actingAs($admin)->postJson("/api/invoices/{$pastDue->id}/payments", [
                'amount' => 25,
                'payment_method' => 'cash',
            ])->assertCreated();

            $this->actingAs($admin)->putJson("/api/invoices/{$pastDue->id}/status", ['status' => 'cancelled'])
                ->assertUnprocessable();
            $this->actingAs($admin)->deleteJson("/api/invoices/{$pastDue->id}")
                ->assertUnprocessable();
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_invoice_pdf_uses_saved_local_brand_identity_without_remote_fetching(): void
    {
        Storage::fake('public');
        Storage::disk('public')->put('brand/logo.png', base64_decode(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/pU8AAAAASUVORK5CYII='
        ));

        DB::table('settings')->updateOrInsert(
            ['key' => 'appearance'],
            [
                'value' => json_encode([
                    'logo_url' => '/storage/brand/logo.png',
                    'primary_color' => '#123456',
                ]),
                'is_public' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );

        $service = app(InvoicePdfService::class);
        $brand = $service->resolveBrandIdentity();
        $this->assertSame('#123456', $brand['primary_color']);
        $this->assertStringStartsWith('data:image/png;base64,', $brand['logo_data_uri']);

        DB::table('settings')->where('key', 'appearance')->update([
            'value' => json_encode(['logo_url' => 'https://external.invalid/logo.png', 'primary_color' => '#123456']),
        ]);
        $remoteBrand = $service->resolveBrandIdentity();
        $this->assertSame('', $remoteBrand['logo_data_uri']);
    }

}
