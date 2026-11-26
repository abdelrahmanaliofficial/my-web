import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
  InvoiceRecord,
  calculateBillingSummary,
  computeLineItemsTotal,
  formatBillingCurrencyTotals,
  filterInvoices,
  formatCurrencyAmount,
  sanitizePaymentPayload,
} from '../src/types/billing';
import { User } from '../src/types/auth';
import { evaluateRouteAccess } from '../src/components/auth/ProtectedRoute';
import { getAuthorizedNavItems } from '../src/pages/dashboard/DashboardLayout';
import { createApiClient } from '../src/lib/apiClient';

test('Billing calculation & filtering helpers compute totals accurately without trusting arbitrary amounts', () => {
  const total = computeLineItemsTotal([
    { description: 'Architecture', quantity: 2, unit_price: 450.5 },
    { description: 'Security Audit', quantity: 1, unit_price: 299 },
  ]);
  assert.equal(total, 1200);

  const formatted = formatCurrencyAmount(1200, 'USD');
  assert.match(formatted, /1,200\.00/);

  const sampleInvoices: InvoiceRecord[] = [
    {
      id: 1,
      invoice_number: 'INV-2026-0001',
      client_id: 10,
      amount: 1000,
      paid_amount: 400,
      balance_due: 600,
      currency: 'USD',
      status: 'partially_paid',
      description: 'Phase 1',
      client: { id: 10, client_code: 'CL-001', full_name: 'Alice Corp', email: 'alice@corp.test' },
    },
    {
      id: 2,
      invoice_number: 'INV-2026-0002',
      client_id: 10,
      amount: 500,
      paid_amount: 500,
      balance_due: 0,
      currency: 'USD',
      status: 'paid',
      description: 'Retainer',
      client: { id: 10, client_code: 'CL-001', full_name: 'Alice Corp', email: 'alice@corp.test' },
    },
    {
      id: 3,
      invoice_number: 'INV-2026-0003',
      client_id: 11,
      amount: 750,
      paid_amount: 0,
      balance_due: 750,
      currency: 'USD',
      status: 'overdue',
      description: 'API Delivery',
      client: { id: 11, client_code: 'CL-002', full_name: 'Bob LLC', email: 'bob@llc.test' },
    },
    {
      id: 4,
      invoice_number: 'INV-2026-0004',
      client_id: 11,
      amount: 900,
      paid_amount: 0,
      balance_due: 900,
      currency: 'USD',
      status: 'draft',
      description: 'Upcoming Draft',
    },
    {
      id: 5,
      invoice_number: 'INV-2026-0005',
      client_id: 11,
      amount: 300,
      paid_amount: 0,
      balance_due: 300,
      currency: 'USD',
      status: 'cancelled',
      description: 'Voided',
    },
  ];

  const summary = calculateBillingSummary(sampleInvoices);
  assert.deepEqual(summary.byCurrency, [{
    currency: 'USD',
    totalInvoiced: 2250,
    totalCollected: 900,
    outstandingBalance: 1350,
  }]);
  assert.equal(formatBillingCurrencyTotals(summary.byCurrency, 'totalInvoiced'), formatCurrencyAmount(2250, 'USD'));
  assert.equal(summary.overdueCount, 1);
  assert.equal(summary.draftCount, 1);
  assert.equal(summary.paidCount, 1);

  const multiCurrency = calculateBillingSummary([
    { ...sampleInvoices[0], id: 10, currency: 'USD', amount: 100, paid_amount: 0, balance_due: 100 },
    { ...sampleInvoices[0], id: 11, currency: 'EGP', amount: 100, paid_amount: 0, balance_due: 100 },
  ]);
  assert.deepEqual(multiCurrency.byCurrency.map((row) => row.currency), ['EGP', 'USD']);
  assert.equal(multiCurrency.byCurrency.find((row) => row.currency === 'EGP')?.totalInvoiced, 100);
  assert.equal(multiCurrency.byCurrency.find((row) => row.currency === 'USD')?.totalInvoiced, 100);

  assert.equal(filterInvoices(sampleInvoices, { search: 'Bob' }).length, 1);
  assert.equal(filterInvoices(sampleInvoices, { status: 'overdue' })[0].invoice_number, 'INV-2026-0003');
});

test('sanitizePaymentPayload rejects card numbers/CVV and allows offline tracking methods only', () => {
  const valid = sanitizePaymentPayload({
    amount: 350.5,
    payment_method: 'bank_transfer',
    paid_at: '2026-11-25',
    notes: 'Wire ref #8821',
  });
  assert.deepEqual(valid, {
    amount: 350.5,
    payment_method: 'bank_transfer',
    paid_at: '2026-11-25',
    notes: 'Wire ref #8821',
  });

  assert.throws(
    () =>
      sanitizePaymentPayload({
        amount: 100,
        payment_method: 'bank_transfer',
        card_number: '4111111111111111',
      }),
    /prohibited/i
  );

  assert.throws(
    () =>
      sanitizePaymentPayload({
        amount: 100,
        payment_method: 'wire',
        cvv: '123',
      }),
    /prohibited/i
  );

  assert.throws(
    () =>
      sanitizePaymentPayload({
        amount: 100,
        payment_method: 'cash',
        card_expiry: '12/29',
      }),
    /prohibited/i
  );
});

test('Billing route & navigation RBAC enforce view_billing, manage_billing, and client restrictions', () => {
  const billingViewer: User = {
    id: 30,
    name: 'Billing Viewer',
    email: 'bv@example.com',
    role: 'custom_admin',
    permissions: ['view_billing'],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };

  const leadsOnlyAdmin: User = {
    id: 31,
    name: 'Leads Only',
    email: 'lo@example.com',
    role: 'custom_admin',
    permissions: ['view_leads'],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };

  const clientUser: User = {
    id: 32,
    name: 'Client',
    email: 'cl@example.com',
    role: 'client',
    permissions: [],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };

  assert.equal(
    evaluateRouteAccess({
      user: billingViewer,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_billing', 'manage_billing'],
    }),
    'allowed'
  );

  assert.equal(
    evaluateRouteAccess({
      user: leadsOnlyAdmin,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_billing', 'manage_billing'],
    }),
    'forbidden'
  );

  assert.equal(
    evaluateRouteAccess({
      user: clientUser,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_billing', 'manage_billing'],
    }),
    'forbidden'
  );

  assert.deepEqual(
    getAuthorizedNavItems(billingViewer).map((i) => i.id),
    ['billing', 'profile']
  );
});

test('End-to-end stateful billing API workflow: draft edit lock, sequential numbering, card rejection, partial/full payment, PDF, RBAC & client isolation', async () => {
  interface MockActor {
    id: number;
    role: 'super_admin' | 'custom_admin' | 'client';
    permissions: string[];
    clientId?: number;
  }

  let currentActor: MockActor = { id: 1, role: 'super_admin', permissions: [] };
  let nextInvoiceSeq = 1;
  let nextInvoiceId = 1;
  let nextPaymentId = 1;

  interface StoredInvoice {
    id: number;
    invoice_number: string;
    client_id: number;
    client_name: string;
    project_id: number | null;
    description: string;
    amount: number;
    paid_amount: number;
    balance_due: number;
    currency: string;
    status: string;
    items: Array<{ id: number; description: string; quantity: number; unit_price: number; line_total: number }>;
    payments: Array<{ id: number; payment_reference: string; amount: number; currency: string; payment_method: string; paid_at: string }>;
  }

  const invoices: StoredInvoice[] = [];

  const can = (actor: MockActor, perm: string) =>
    actor.role === 'super_admin' ||
    (actor.role === 'custom_admin' &&
      (actor.permissions.includes(perm) || actor.permissions.includes('manage_billing')));

  const readJsonBody = async (req: http.IncomingMessage) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    return JSON.parse(raw || '{}');
  };

  const server = http.createServer(async (req, res) => {
    const url = req.url || '';
    const method = req.method || 'GET';

    if (method === 'GET' && url === '/sanctum/csrf-cookie') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Create invoice
    if (method === 'POST' && url === '/api/invoices') {
      if (!can(currentActor, 'create_billing')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Forbidden.' }));
        return;
      }
      const body = await readJsonBody(req);
      const items = (body.items || []).map((it: { description: string; quantity: number; unit_price: number }, i: number) => {
        const line_total = Math.round(Number(it.quantity) * Number(it.unit_price) * 100) / 100;
        return { id: i + 1, description: it.description, quantity: Number(it.quantity), unit_price: Number(it.unit_price), line_total };
      });
      const authoritativeAmount = items.reduce((s: number, it: { line_total: number }) => s + it.line_total, 0);
      const seq = String(nextInvoiceSeq++).padStart(4, '0');
      const created: StoredInvoice = {
        id: nextInvoiceId++,
        invoice_number: `INV-2026-${seq}`,
        client_id: Number(body.client_id),
        client_name: Number(body.client_id) === 101 ? 'Client Alpha' : 'Client Beta',
        project_id: body.project_id ?? null,
        description: body.description || '',
        amount: authoritativeAmount,
        paid_amount: 0,
        balance_due: authoritativeAmount,
        currency: body.currency || 'USD',
        status: body.issue_immediately ? 'issued' : 'draft',
        items,
        payments: [],
      };
      invoices.push(created);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: created }));
      return;
    }

    // Update draft invoice
    const editMatch = url.match(/^\/api\/invoices\/(\d+)$/);
    if (method === 'PUT' && editMatch) {
      if (!can(currentActor, 'update_billing')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Forbidden.' }));
        return;
      }
      const inv = invoices.find((i) => i.id === Number(editMatch[1]));
      if (!inv) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (inv.status !== 'draft') {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Only draft invoices can be edited.' }));
        return;
      }
      const body = await readJsonBody(req);
      if (body.description !== undefined) inv.description = body.description;
      if (Array.isArray(body.items)) {
        inv.items = body.items.map((it: { description: string; quantity: number; unit_price: number }, i: number) => ({
          id: i + 1,
          description: it.description,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          line_total: Math.round(Number(it.quantity) * Number(it.unit_price) * 100) / 100,
        }));
        inv.amount = inv.items.reduce((s, it) => s + it.line_total, 0);
        inv.balance_due = Math.round((inv.amount - inv.paid_amount) * 100) / 100;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: inv }));
      return;
    }

    // Issue draft invoice
    const issueMatch = url.match(/^\/api\/invoices\/(\d+)\/issue$/);
    if (method === 'POST' && issueMatch) {
      if (!can(currentActor, 'update_billing')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Forbidden.' }));
        return;
      }
      const inv = invoices.find((i) => i.id === Number(issueMatch[1]));
      if (!inv || inv.status !== 'draft') {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Only draft invoices can be issued.' }));
        return;
      }
      inv.status = 'issued';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: inv }));
      return;
    }

    // Record payment
    const payMatch = url.match(/^\/api\/invoices\/(\d+)\/payments$/);
    if (method === 'POST' && payMatch) {
      if (!can(currentActor, 'update_billing')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Forbidden.' }));
        return;
      }
      const inv = invoices.find((i) => i.id === Number(payMatch[1]));
      if (!inv) {
        res.writeHead(404);
        res.end();
        return;
      }
      const body = await readJsonBody(req);
      if ('card_number' in body || 'cvv' in body || 'cvc' in body || 'expiry' in body) {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Card numbers and CVV fields are prohibited.' }));
        return;
      }
      const amount = Number(body.amount);
      if (amount > inv.balance_due) {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Payment exceeds balance due.' }));
        return;
      }
      inv.payments.push({
        id: nextPaymentId++,
        payment_reference: `PAY-20261125-00${nextPaymentId}`,
        amount,
        currency: inv.currency,
        payment_method: body.payment_method,
        paid_at: body.paid_at || '2026-11-25',
      });
      inv.paid_amount = Math.round((inv.paid_amount + amount) * 100) / 100;
      inv.balance_due = Math.round(Math.max(0, inv.amount - inv.paid_amount) * 100) / 100;
      inv.status = inv.balance_due <= 0 ? 'paid' : 'partially_paid';

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: inv }));
      return;
    }

    // Client endpoints
    if (method === 'GET' && url === '/api/client/invoices') {
      if (currentActor.role !== 'client' || !currentActor.clientId) {
        res.writeHead(403);
        res.end();
        return;
      }
      const scoped = invoices.filter(
        (i) => i.client_id === currentActor.clientId && i.status !== 'draft'
      );
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: scoped }));
      return;
    }

    const clientPdfMatch = url.match(/^\/api\/client\/invoices\/(\d+)\/pdf$/);
    if (method === 'GET' && clientPdfMatch) {
      const inv = invoices.find((i) => i.id === Number(clientPdfMatch[1]));
      if (
        !inv ||
        currentActor.role !== 'client' ||
        inv.client_id !== currentActor.clientId ||
        inv.status === 'draft'
      ) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Forbidden.' }));
        return;
      }
      const pdfContent = `%PDF-1.4\n(${inv.invoice_number} - ${inv.client_name})\n%%EOF\n`;
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(pdfContent);
      return;
    }

    const clientInvMatch = url.match(/^\/api\/client\/invoices\/(\d+)(\/payments)?$/);
    if (method === 'GET' && clientInvMatch) {
      const inv = invoices.find((i) => i.id === Number(clientInvMatch[1]));
      if (
        !inv ||
        currentActor.role !== 'client' ||
        inv.client_id !== currentActor.clientId ||
        inv.status === 'draft'
      ) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Forbidden.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: clientInvMatch[2] ? inv.payments : inv,
        })
      );
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const client = createApiClient(`http://127.0.0.1:${addr.port}`);

  try {
    // 1. Admin creates draft invoice with untrusted amount -> server computes from line items (900)
    const create1 = await client.post('/api/invoices', {
      client_id: 101,
      currency: 'USD',
      amount: 1,
      items: [{ description: 'Platform Architecture', quantity: 2, unit_price: 450 }],
    });
    assert.equal(create1.status, 201);
    assert.equal(create1.data.data.invoice_number, 'INV-2026-0001');
    assert.equal(create1.data.data.amount, 900);
    assert.equal(create1.data.data.status, 'draft');

    // 2. Edit draft updates amount safely
    const editRes = await client.put('/api/invoices/1', {
      description: 'Updated Scope',
      items: [{ description: 'Platform Architecture', quantity: 2, unit_price: 500 }],
    });
    assert.equal(editRes.data.data.amount, 1000);

    // 3. Issue draft -> status becomes issued; subsequent edits rejected with 422
    const issueRes = await client.post('/api/invoices/1/issue');
    assert.equal(issueRes.data.data.status, 'issued');
    await assert.rejects(() => client.put('/api/invoices/1', { description: 'Tamper' }));

    // 4. Reject prohibited card_number/cvv fields on backend
    await assert.rejects(() =>
      client.post('/api/invoices/1/payments', {
        amount: 200,
        payment_method: 'bank_transfer',
        card_number: '4242424242424242',
        cvv: '999',
      })
    );

    // 5. Partial payment -> partially_paid, second payment -> paid
    const p1 = await client.post('/api/invoices/1/payments', {
      amount: 400,
      payment_method: 'bank_transfer',
    });
    assert.equal(p1.data.data.status, 'partially_paid');
    assert.equal(p1.data.data.balance_due, 600);

    const p2 = await client.post('/api/invoices/1/payments', {
      amount: 600,
      payment_method: 'wire',
    });
    assert.equal(p2.data.data.status, 'paid');
    assert.equal(p2.data.data.balance_due, 0);

    // 6. Second sequential invoice for client 102
    const create2 = await client.post('/api/invoices', {
      client_id: 102,
      currency: 'USD',
      issue_immediately: true,
      items: [{ description: 'Audit', quantity: 1, unit_price: 500 }],
    });
    assert.equal(create2.data.data.invoice_number, 'INV-2026-0002');

    // 7. Draft invoice for client 101 stays hidden from client portal
    await client.post('/api/invoices', {
      client_id: 101,
      currency: 'USD',
      items: [{ description: 'Hidden Draft', quantity: 1, unit_price: 250 }],
    });

    // 8. View-only admin gets 403 on mutations
    currentActor = { id: 2, role: 'custom_admin', permissions: ['view_billing'] };
    await assert.rejects(() =>
      client.post('/api/invoices', {
        client_id: 101,
        currency: 'USD',
        items: [{ description: 'Unauthorized', quantity: 1, unit_price: 100 }],
      })
    );

    // 9. Client Alpha accesses own issued invoice & PDF, blocked from draft & Client Beta's invoice
    currentActor = { id: 10, role: 'client', permissions: [], clientId: 101 };
    const alphaList = await client.get('/api/client/invoices');
    assert.equal(alphaList.data.data.length, 1);
    assert.equal(alphaList.data.data[0].invoice_number, 'INV-2026-0001');

    const pdfRes = await client.get('/api/client/invoices/1/pdf', { responseType: 'text' });
    assert.equal(pdfRes.headers['content-type'], 'application/pdf');
    assert.match(String(pdfRes.data), /^%PDF-1\.4/);
    assert.match(String(pdfRes.data), /INV-2026-0001/);

    await assert.rejects(() => client.get('/api/client/invoices/2'));
    await assert.rejects(() => client.get('/api/client/invoices/2/payments'));
    await assert.rejects(() => client.get('/api/client/invoices/2/pdf'));
    await assert.rejects(() => client.get('/api/client/invoices/3'));
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Billing frontend files avoid localStorage, browser popups, and card/CVV collection', () => {
  const root = path.resolve(process.cwd());
  const files = [
    'src/types/billing.ts',
    'src/contexts/BillingContext.tsx',
    'src/pages/dashboard/BillingDashboard.tsx',
    'src/components/client/ClientInvoicesSection.tsx',
  ];

  for (const rel of files) {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(/localStorage/.test(content), false, `${rel} must not use localStorage`);
    assert.equal(
      /window\.(open|alert|confirm)\s*\(/.test(content),
      false,
      `${rel} must not call window.open/alert/confirm`
    );
    if (rel.endsWith('.tsx')) {
      assert.equal(
        /input[^>]*(card.?number|cvv|cvc)/i.test(content),
        false,
        `${rel} must not collect card numbers or CVV`
      );
    }
  }
});
