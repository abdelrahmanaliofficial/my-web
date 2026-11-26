import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  ClientRecord,
  filterClients,
  sanitizeClientSelfUpdatePayload,
} from '../src/types/client';
import { createApiClient } from '../src/lib/apiClient';
import { evaluateRouteAccess } from '../src/components/auth/ProtectedRoute';
import { getAuthorizedNavItems } from '../src/pages/dashboard/DashboardLayout';
import { User } from '../src/types/auth';

test('sanitizeClientSelfUpdatePayload strictly allows personal info and strips restricted fields', () => {
  const dirtyInput = {
    full_name: '  Nadia Adel  ',
    phone: '+201012345678',
    company_name: 'Delta Tech',
    address: 'Giza, Egypt',
    role: 'super_admin',
    account_status: 'active',
    client_code: 'CL-999999',
    permissions: ['*'],
    user_id: 1,
    is_active: true,
    email: 'hacked@example.com',
    id: 999,
  };

  const clean = sanitizeClientSelfUpdatePayload(dirtyInput);
  assert.deepEqual(clean, {
    full_name: 'Nadia Adel',
    phone: '+201012345678',
    company_name: 'Delta Tech',
    address: 'Giza, Egypt',
  });
  assert.equal('role' in clean, false);
  assert.equal('account_status' in clean, false);
  assert.equal('client_code' in clean, false);
  assert.equal('permissions' in clean, false);
  assert.equal('email' in clean, false);
});

test('filterClients filters by search query, account status, and assigned service', () => {
  const sampleClients: ClientRecord[] = [
    {
      id: 1,
      client_code: 'CL-A1B2C3',
      user_id: 101,
      full_name: 'Omar Khaled',
      email: 'omar@alpha.io',
      phone: '+20100111222',
      company_name: 'Alpha Studio',
      address: 'Cairo',
      account_status: 'active',
      created_at: '2026-01-01T10:00:00Z',
      updated_at: '2026-01-02T10:00:00Z',
      services: [{ id: 5, slug: 'seo', name: 'SEO Growth' }],
    },
    {
      id: 2,
      client_code: 'CL-D4E5F6',
      user_id: 102,
      full_name: 'Laila Mansour',
      email: 'laila@beta.io',
      phone: '+20100999888',
      company_name: 'Beta Commerce',
      address: 'Alexandria',
      account_status: 'invited',
      created_at: '2026-01-03T10:00:00Z',
      updated_at: '2026-01-03T10:00:00Z',
      services: [{ id: 7, slug: 'web', name: 'Web Engineering' }],
    },
    {
      id: 3,
      client_code: 'CL-G7H8I9',
      user_id: 103,
      full_name: 'Kareem Tarek',
      email: 'kareem@gamma.io',
      phone: null,
      company_name: 'Gamma Holdings',
      address: null,
      account_status: 'suspended',
      created_at: '2026-01-04T10:00:00Z',
      updated_at: '2026-01-05T10:00:00Z',
      services: [{ id: 5, slug: 'seo', name: 'SEO Growth' }],
    },
  ];

  assert.equal(filterClients(sampleClients, { search: 'CL-D4E5F6' }).length, 1);
  assert.equal(filterClients(sampleClients, { search: 'Beta Commerce' })[0].id, 2);
  assert.equal(filterClients(sampleClients, { status: 'suspended' })[0].id, 3);
  assert.deepEqual(
    filterClients(sampleClients, { serviceId: 5 }).map((c) => c.id),
    [1, 3]
  );
  assert.deepEqual(
    filterClients(sampleClients, { status: 'active', serviceId: 5 }).map((c) => c.id),
    [1]
  );
});

test('Client route & navigation protection enforces view_clients / manage_clients and denies unauthorized callers', () => {
  const clientUser: User = {
    id: 1,
    name: 'Client',
    email: 'client@example.com',
    role: 'client',
    permissions: [],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };
  const leadsOnlyAdmin: User = {
    id: 2,
    name: 'Leads Admin',
    email: 'leads@example.com',
    role: 'custom_admin',
    permissions: ['view_leads'],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };
  const clientViewerAdmin: User = {
    id: 3,
    name: 'Clients Viewer',
    email: 'viewer@example.com',
    role: 'custom_admin',
    permissions: ['view_clients'],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };
  const superAdmin: User = {
    id: 4,
    name: 'Super Admin',
    email: 'super@example.com',
    role: 'super_admin',
    permissions: [],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };

  assert.equal(
    evaluateRouteAccess({
      user: clientUser,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_clients', 'manage_clients'],
    }),
    'forbidden'
  );
  assert.equal(
    evaluateRouteAccess({
      user: leadsOnlyAdmin,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_clients', 'manage_clients'],
    }),
    'forbidden'
  );
  assert.equal(
    evaluateRouteAccess({
      user: clientViewerAdmin,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_clients', 'manage_clients'],
    }),
    'allowed'
  );
  assert.equal(
    evaluateRouteAccess({
      user: superAdmin,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_clients', 'manage_clients'],
    }),
    'allowed'
  );

  assert.equal(
    getAuthorizedNavItems(leadsOnlyAdmin).some((i) => i.id === 'clients'),
    false
  );
  assert.equal(
    getAuthorizedNavItems(clientViewerAdmin).some((i) => i.id === 'clients'),
    true
  );
  assert.equal(
    getAuthorizedNavItems(clientUser).some((i) => i.id === 'clients'),
    false
  );
});

test('apiClient end-to-end client lifecycle: creation, duplicate email rejection, invitation accept, suspension, reactivation, and authorization', async () => {
  type ActorRole = 'super_admin' | 'client' | 'guest';
  let currentRole: ActorRole = 'super_admin';

  interface StoredClient extends ClientRecord {
    tokenHash?: string;
    tokenExpiresAt?: number;
    tokenAccepted?: boolean;
  }

  const dbClients: StoredClient[] = [];
  let nextId = 1;

  const readJsonBody = (req: http.IncomingMessage): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(body || '{}'));
        } catch {
          resolve({});
        }
      });
    });

  const server = http.createServer(async (req, res) => {
    const reqUrl = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = reqUrl.pathname;

    if (req.method === 'GET' && pathname === '/sanctum/csrf-cookie') {
      res.writeHead(204, { 'Set-Cookie': ['XSRF-TOKEN=xsrf-client-test; Path=/'] });
      res.end();
      return;
    }

    if (req.method === 'GET' && pathname === '/api/client-invitations/verify') {
      const token = reqUrl.searchParams.get('token') || '';
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const client = dbClients.find(
        (c) =>
          c.tokenHash === hash &&
          !c.tokenAccepted &&
          (c.tokenExpiresAt || 0) > Date.now()
      );
      if (!client) {
        res.writeHead(410, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Invitation invalid or expired.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: {
            client_code: client.client_code,
            full_name: client.full_name,
            email: client.email,
            expires_at: new Date(client.tokenExpiresAt!).toISOString(),
          },
        })
      );
      return;
    }

    if (req.method === 'POST' && pathname === '/api/client-invitations/accept') {
      const body = await readJsonBody(req);
      const token = String(body.token || '');
      const hash = crypto.createHash('sha256').update(token).digest('hex');
      const client = dbClients.find(
        (c) =>
          c.tokenHash === hash &&
          !c.tokenAccepted &&
          (c.tokenExpiresAt || 0) > Date.now()
      );
      if (!client) {
        res.writeHead(410, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Invitation invalid or expired.' }));
        return;
      }
      client.tokenAccepted = true;
      client.account_status = 'active';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    if (pathname.startsWith('/api/clients')) {
      if (currentRole !== 'super_admin') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Forbidden: client management requires admin privileges.' }));
        return;
      }

      if (req.method === 'GET' && pathname === '/api/clients') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: dbClients }));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/clients') {
        const body = await readJsonBody(req);
        const email = String(body.email || '').toLowerCase();
        if (dbClients.some((c) => c.email.toLowerCase() === email)) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              message: 'The email has already been taken.',
              errors: { email: ['The email has already been taken.'] },
            })
          );
          return;
        }
        const rawToken = 'invite-token-' + crypto.randomBytes(24).toString('hex');
        const created: StoredClient = {
          id: nextId++,
          client_code: `CL-${String(nextId).padStart(5, '0')}`,
          user_id: 500 + nextId,
          full_name: String(body.full_name || ''),
          email,
          phone: body.phone ? String(body.phone) : null,
          company_name: body.company_name ? String(body.company_name) : null,
          address: body.address ? String(body.address) : null,
          account_status: 'invited',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          tokenHash: crypto.createHash('sha256').update(rawToken).digest('hex'),
          tokenExpiresAt: Date.now() + 3600_000,
          tokenAccepted: false,
        };
        dbClients.push(created);
        res.writeHead(201, {
          'Content-Type': 'application/json',
          'X-Test-Invite-Token': rawToken,
        });
        res.end(JSON.stringify({ data: created }));
        return;
      }

      const statusMatch = pathname.match(/^\/api\/clients\/(\d+)\/status$/);
      if (req.method === 'PUT' && statusMatch) {
        const client = dbClients.find((c) => c.id === Number(statusMatch[1]));
        const body = await readJsonBody(req);
        if (!client) {
          res.writeHead(404);
          res.end();
          return;
        }
        client.account_status = body.account_status === 'active' ? 'active' : 'suspended';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: client }));
        return;
      }
    }

    if (pathname === '/api/client/profile') {
      if (currentRole !== 'client') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Forbidden' }));
        return;
      }
      const client = dbClients[0];
      if (!client || client.account_status !== 'active') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Account is suspended or inactive.' }));
        return;
      }
      if (req.method === 'PUT') {
        const body = await readJsonBody(req);
        if ('role' in body || 'account_status' in body || 'client_code' in body) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Restricted fields cannot be modified.' }));
          return;
        }
        client.full_name = String(body.full_name || client.full_name);
        client.phone = body.phone ? String(body.phone) : client.phone;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: client }));
        return;
      }
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const client = createApiClient(`http://127.0.0.1:${addr.port}`);

  try {
    // 1. Super Admin creates client profile + invitation
    await client.get('/sanctum/csrf-cookie');
    const createRes = await client.post('/api/clients', {
      full_name: 'Mona Ibrahim',
      email: 'mona@client.com',
      phone: '+201000001234',
      company_name: 'Nile Brands',
      send_invitation: true,
    });
    assert.equal(createRes.status, 201);
    assert.equal(createRes.data.data.account_status, 'invited');
    assert.equal('password' in createRes.data.data, false);
    const inviteToken = String(createRes.headers['x-test-invite-token']);
    const clientId = createRes.data.data.id;

    // 2. Duplicate email rejected with 422
    await assert.rejects(
      () =>
        client.post('/api/clients', {
          full_name: 'Duplicate Mona',
          email: 'mona@client.com',
        }),
      (err: { response?: { status?: number } }) => err.response?.status === 422
    );

    // 3. Invitation verified and accepted -> status becomes active; token cannot be reused
    const verifyRes = await client.get('/api/client-invitations/verify', {
      params: { token: inviteToken },
    });
    assert.equal(verifyRes.data.data.email, 'mona@client.com');

    await client.post('/api/client-invitations/accept', {
      token: inviteToken,
      password: 'ClientStrongPassword123',
      password_confirmation: 'ClientStrongPassword123',
    });

    await assert.rejects(
      () =>
        client.post('/api/client-invitations/accept', {
          token: inviteToken,
          password: 'ClientStrongPassword123',
          password_confirmation: 'ClientStrongPassword123',
        }),
      (err: { response?: { status?: number } }) => err.response?.status === 410
    );

    // 4. Client cannot access /api/clients (403) but can update permitted self-profile fields
    currentRole = 'client';
    await assert.rejects(
      () => client.get('/api/clients'),
      (err: { response?: { status?: number } }) => err.response?.status === 403
    );

    const safePayload = sanitizeClientSelfUpdatePayload({
      full_name: 'Mona Updated',
      phone: '+201099999999',
      company_name: 'Nile Brands',
      address: 'New Cairo',
      role: 'super_admin',
      account_status: 'suspended',
    });
    const selfRes = await client.put('/api/client/profile', safePayload);
    assert.equal(selfRes.data.data.full_name, 'Mona Updated');

    // 5. Super Admin suspends client -> client profile update is now blocked (403)
    currentRole = 'super_admin';
    const suspendRes = await client.put(`/api/clients/${clientId}/status`, {
      account_status: 'suspended',
    });
    assert.equal(suspendRes.data.data.account_status, 'suspended');

    currentRole = 'client';
    await assert.rejects(
      () => client.put('/api/client/profile', safePayload),
      (err: { response?: { status?: number } }) => err.response?.status === 403
    );

    // 6. Super Admin reactivates client
    currentRole = 'super_admin';
    const activateRes = await client.put(`/api/clients/${clientId}/status`, {
      account_status: 'active',
    });
    assert.equal(activateRes.data.data.account_status, 'active');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Client frontend files never store credentials in localStorage or send plaintext passwords during creation', () => {
  const root = path.resolve(process.cwd());
  const files = [
    'src/types/client.ts',
    'src/pages/dashboard/ClientsPage.tsx',
    'src/pages/AcceptInvitationPage.tsx',
    'src/pages/dashboard/ClientPortalPage.tsx',
  ];

  for (const rel of files) {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(/localStorage\.(setItem|getItem)/.test(content), false, `${rel} must not use localStorage`);
  }

  const clientsPage = fs.readFileSync(path.join(root, 'src/pages/dashboard/ClientsPage.tsx'), 'utf8');
  assert.equal(/createPassword|defaultPassword/.test(clientsPage), false);
});
