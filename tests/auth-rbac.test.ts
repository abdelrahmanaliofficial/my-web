import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import {
  normalizeRole,
  sanitizeUserPayload,
  User,
} from '../src/types/auth';
import {
  createApiClient,
  registerAuthErrorHandlers,
} from '../src/lib/apiClient';
import {
  checkUserPermission,
  checkUserRole,
} from '../src/contexts/AuthContext';
import {
  evaluateRouteAccess,
} from '../src/components/auth/ProtectedRoute';
import {
  getAuthorizedNavItems,
} from '../src/pages/dashboard/DashboardLayout';
import { LanguageProvider } from '../src/i18n/LanguageContext';
import LoginForm from '../src/components/auth/LoginForm';

test('normalizeRole & sanitizeUserPayload strip password fields and reject invalid roles', () => {
  assert.equal(normalizeRole('super_admin'), 'super_admin');
  assert.equal(normalizeRole('Custom Admin'), 'custom_admin');
  assert.equal(normalizeRole('client'), 'client');
  assert.equal(normalizeRole('root'), null);
  assert.equal(normalizeRole(null), null);

  const rawPayload = {
    id: 42,
    name: 'Test Admin',
    email: 'admin@example.com',
    role: 'custom_admin',
    permissions: ['view_leads', 123, 'manage_settings'],
    is_active: true,
    email_verified_at: '2026-01-01T00:00:00Z',
    suspended_at: null,
    password: 'should-never-survive',
    password_hash: 'secret-hash',
  };

  const sanitized = sanitizeUserPayload(rawPayload);
  assert.ok(sanitized);
  assert.equal(sanitized.id, 42);
  assert.equal(sanitized.role, 'custom_admin');
  assert.deepEqual(sanitized.permissions, ['view_leads', 'manage_settings']);
  assert.equal('password' in sanitized, false);
  assert.equal('password_hash' in sanitized, false);

  assert.equal(
    sanitizeUserPayload({ id: 1, email: 'x@y.com', role: 'unknown_role' }),
    null
  );

  const missingActiveFlag = sanitizeUserPayload({
    id: 43,
    name: 'Incomplete User',
    email: 'incomplete@example.com',
    role: 'custom_admin',
    permissions: ['view_leads'],
  });
  assert.ok(missingActiveFlag);
  assert.equal(missingActiveFlag.is_active, false, 'Missing server activity state must fail closed.');
});

test('checkUserRole & checkUserPermission enforce active status, super_admin, view-only, and manage_* implications', () => {
  const superAdmin: User = {
    id: 1,
    name: 'Super',
    email: 'super@example.com',
    role: 'super_admin',
    permissions: [],
    is_active: true,
    email_verified_at: '2026-01-01T00:00:00Z',
    suspended_at: null,
  };

  const viewOnlyAdmin: User = {
    id: 2,
    name: 'Viewer',
    email: 'viewer@example.com',
    role: 'custom_admin',
    permissions: ['view_leads', 'view_settings'],
    is_active: true,
    email_verified_at: '2026-01-01T00:00:00Z',
    suspended_at: null,
  };

  const leadsManager: User = {
    id: 3,
    name: 'Manager',
    email: 'manager@example.com',
    role: 'custom_admin',
    permissions: ['manage_leads'],
    is_active: true,
    email_verified_at: '2026-01-01T00:00:00Z',
    suspended_at: null,
  };

  const suspendedAdmin: User = {
    ...superAdmin,
    suspended_at: '2026-02-01T00:00:00Z',
  };

  assert.equal(checkUserRole(superAdmin, ['super_admin']), true);
  assert.equal(checkUserPermission(superAdmin, 'manage_team'), true);

  assert.equal(checkUserPermission(viewOnlyAdmin, 'view_leads'), true);
  assert.equal(checkUserPermission(viewOnlyAdmin, 'update_leads'), false);
  assert.equal(checkUserPermission(viewOnlyAdmin, 'delete_leads'), false);
  assert.equal(checkUserPermission(viewOnlyAdmin, 'manage_leads'), false);

  assert.equal(checkUserPermission(leadsManager, 'view_leads'), true);
  assert.equal(checkUserPermission(leadsManager, 'update_leads'), true);
  assert.equal(checkUserPermission(leadsManager, 'delete_leads'), true);
  assert.equal(checkUserPermission(leadsManager, 'manage_leads'), true);
  assert.equal(checkUserPermission(leadsManager, 'manage_team'), false);

  assert.equal(checkUserRole(suspendedAdmin, ['super_admin']), false);
  assert.equal(checkUserPermission(suspendedAdmin, 'manage_team'), false);

  const legacyWildcardAdmin: User = {
    ...viewOnlyAdmin,
    id: 4,
    permissions: ['*'],
  };
  assert.equal(
    checkUserPermission(legacyWildcardAdmin, 'manage_clients'),
    false,
    'A wildcard must never grant a custom administrator global privileges.'
  );
});

test('evaluateRouteAccess protects direct URLs per role and permission (unauthenticated, 403 forbidden, allowed)', () => {
  const clientUser: User = {
    id: 10,
    name: 'Client User',
    email: 'client@example.com',
    role: 'client',
    permissions: [],
    is_active: true,
    email_verified_at: '2026-01-01T00:00:00Z',
    suspended_at: null,
  };

  const customViewer: User = {
    id: 11,
    name: 'Leads Viewer',
    email: 'leads@example.com',
    role: 'custom_admin',
    permissions: ['view_leads'],
    is_active: true,
    email_verified_at: '2026-01-01T00:00:00Z',
    suspended_at: null,
  };

  const superAdmin: User = {
    id: 12,
    name: 'Root Admin',
    email: 'root@example.com',
    role: 'super_admin',
    permissions: [],
    is_active: true,
    email_verified_at: '2026-01-01T00:00:00Z',
    suspended_at: null,
  };

  // Loading state
  assert.equal(
    evaluateRouteAccess({ user: null, loading: true, allowedRoles: ['super_admin'] }),
    'loading'
  );

  // Direct URL unauthenticated access -> unauthenticated (redirects to /login)
  assert.equal(
    evaluateRouteAccess({ user: null, loading: false, allowedRoles: ['super_admin', 'custom_admin'] }),
    'unauthenticated'
  );

  // Client attempting direct URL access to admin routes -> 403 forbidden (never silently changes role)
  assert.equal(
    evaluateRouteAccess({
      user: clientUser,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_stats', 'manage_stats'],
    }),
    'forbidden'
  );
  assert.equal(clientUser.role, 'client');

  // Client accessing client portal & profile -> allowed
  assert.equal(
    evaluateRouteAccess({ user: clientUser, loading: false, allowedRoles: ['client'] }),
    'allowed'
  );
  assert.equal(
    evaluateRouteAccess({
      user: clientUser,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin', 'client'],
    }),
    'allowed'
  );

  // Custom admin with view_leads -> allowed on /dashboard/bookings, forbidden on /dashboard/team
  assert.equal(
    evaluateRouteAccess({
      user: customViewer,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_leads', 'manage_leads'],
    }),
    'allowed'
  );
  assert.equal(
    evaluateRouteAccess({
      user: customViewer,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_team', 'manage_team'],
    }),
    'forbidden'
  );

  const teamViewer: User = {
    id: 13,
    name: 'Team Viewer',
    email: 'team-viewer@example.com',
    role: 'custom_admin',
    permissions: ['view_team'],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };
  assert.equal(
    evaluateRouteAccess({
      user: teamViewer,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_team', 'create_team', 'update_team', 'manage_team'],
    }),
    'allowed'
  );
  assert.equal(
    getAuthorizedNavItems(teamViewer).some((item) => item.id === 'team'),
    true,
    'A Custom Admin with view_team should see team navigation.'
  );
  assert.equal(
    getAuthorizedNavItems(customViewer).some((item) => item.id === 'team'),
    false,
    'A Custom Admin without team permissions must not see team navigation.'
  );

  const teamManager: User = {
    ...teamViewer,
    id: 14,
    permissions: ['manage_team'],
  };
  assert.equal(checkUserPermission(teamManager, 'view_team'), true);
  assert.equal(checkUserPermission(teamManager, 'update_team'), true);
  assert.equal(getAuthorizedNavItems(teamManager).some((item) => item.id === 'team'), true);

  // Super admin -> allowed on all admin routes, forbidden on client-only portal
  assert.equal(
    evaluateRouteAccess({
      user: superAdmin,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_team', 'manage_team'],
    }),
    'allowed'
  );
  assert.equal(
    evaluateRouteAccess({ user: superAdmin, loading: false, allowedRoles: ['client'] }),
    'forbidden'
  );
});

test('getAuthorizedNavItems filters dashboard navigation by role and permissions', () => {
  assert.deepEqual(getAuthorizedNavItems(null), []);

  const clientUser: User = {
    id: 20,
    name: 'Client',
    email: 'c@example.com',
    role: 'client',
    permissions: [],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };
  assert.deepEqual(
    getAuthorizedNavItems(clientUser).map((i) => i.id),
    ['client-portal', 'profile']
  );

  const viewLeadsAdmin: User = {
    id: 21,
    name: 'Custom',
    email: 'custom@example.com',
    role: 'custom_admin',
    permissions: ['view_leads'],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };
  assert.deepEqual(
    getAuthorizedNavItems(viewLeadsAdmin).map((i) => i.id),
    ['bookings', 'profile']
  );

  const superAdmin: User = {
    id: 22,
    name: 'Super',
    email: 'super@example.com',
    role: 'super_admin',
    permissions: [],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };
  assert.deepEqual(
    getAuthorizedNavItems(superAdmin).map((i) => i.id),
    ['stats', 'bookings', 'clients', 'projects', 'billing', 'messages', 'team', 'settings', 'profile']
  );
});

test('apiClient executes CSRF init -> session login -> /api/me restore -> logout -> 401/403 handling', async () => {
  let activeSession = false;
  let csrfInitialized = false;
  let seenXsrfHeader = '';

  const server = http.createServer((req, res) => {
    const url = req.url || '';
    if (req.method === 'GET' && url === '/sanctum/csrf-cookie') {
      csrfInitialized = true;
      res.writeHead(204, {
        'Set-Cookie': ['XSRF-TOKEN=test-xsrf-token; Path=/; SameSite=Lax'],
      });
      res.end();
      return;
    }

    if (req.method === 'POST' && url === '/api/login') {
      seenXsrfHeader = String(req.headers['x-xsrf-token'] || '');
      let body = '';
      req.on('data', (c) => {
        body += c;
      });
      req.on('end', () => {
        const parsed = JSON.parse(body || '{}');
        if (parsed.email === 'admin@example.com' && parsed.password === 'valid-pass') {
          activeSession = true;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(401, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Invalid credentials.' }));
        }
      });
      return;
    }

    if (req.method === 'GET' && url === '/api/me') {
      if (!activeSession) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Unauthenticated.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          data: {
            id: 5,
            name: 'Session User',
            email: 'admin@example.com',
            role: 'custom_admin',
            permissions: ['view_leads'],
            is_active: true,
          },
        })
      );
      return;
    }

    if (req.method === 'GET' && url === '/api/team') {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: 'Forbidden: missing manage_team permission.' }));
      return;
    }

    if (req.method === 'POST' && url === '/api/logout') {
      activeSession = false;
      res.writeHead(204);
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseURL = `http://127.0.0.1:${address.port}`;

  let unauthorizedCalls = 0;
  let forbiddenCalls = 0;
  registerAuthErrorHandlers({
    onUnauthorized: () => {
      unauthorizedCalls += 1;
    },
    onForbidden: () => {
      forbiddenCalls += 1;
    },
  });

  const client = createApiClient(baseURL);

  try {
    // 1. CSRF init before login
    const csrfRes = await client.get('/sanctum/csrf-cookie');
    assert.equal(csrfRes.status, 204);
    assert.equal(csrfInitialized, true);

    // 2. Invalid session before login triggers 401 handler
    await assert.rejects(() => client.get('/api/me'));
    assert.equal(unauthorizedCalls, 1);

    // 3. Valid login + XSRF header support (browser auto-populates from XSRF-TOKEN cookie; verify header forwarding in client config)
    assert.equal(client.defaults.withCredentials, true);
    assert.equal(client.defaults.withXSRFToken, true);
    assert.equal(client.defaults.xsrfHeaderName, 'X-XSRF-TOKEN');

    await client.post(
      '/api/login',
      { email: 'admin@example.com', password: 'valid-pass' },
      { headers: { 'X-XSRF-TOKEN': 'test-xsrf-token' } }
    );
    assert.equal(seenXsrfHeader, 'test-xsrf-token');

    // 4. Page refresh simulation via GET /api/me restores user without password
    const meRes = await client.get('/api/me');
    const restored = sanitizeUserPayload(meRes.data.data);
    assert.ok(restored);
    assert.equal(restored.email, 'admin@example.com');
    assert.equal(restored.role, 'custom_admin');

    // 5. 403 triggers forbidden handler without logging out or changing role
    await assert.rejects(() => client.get('/api/team'));
    assert.equal(forbiddenCalls, 1);

    // 6. Logout invalidates server session; subsequent /api/me returns 401
    await client.post('/api/logout');
    await assert.rejects(() => client.get('/api/me'));
    assert.equal(unauthorizedCalls, 2);
  } finally {
    registerAuthErrorHandlers({});
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Frontend auth source files contain no localStorage token persistence or hardcoded credentials', () => {
  const root = path.resolve(process.cwd());
  const filesToAudit = [
    'src/contexts/AuthContext.tsx',
    'src/components/auth/LoginForm.tsx',
    'src/pages/dashboard/BookingsPage.tsx',
    'src/pages/dashboard/DashboardPage.tsx',
    'src/pages/dashboard/TeamSettingsTab.tsx',
    'src/pages/dashboard/ProfileTab.tsx',
  ];

  for (const rel of filesToAudit) {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(
      /localStorage\.setItem/.test(content),
      false,
      `${rel} must not call localStorage.setItem`
    );
    assert.equal(
      /localStorage\.getItem/.test(content),
      false,
      `${rel} must not call localStorage.getItem`
    );
    assert.equal(
      /Bearer\s+\$\{/.test(content),
      false,
      `${rel} must not attach localStorage Bearer tokens`
    );
    assert.equal(
      /admin123|demo@|guest@|abdelrahman@example\.com/.test(content),
      false,
      `${rel} must not include hardcoded demo/admin credentials`
    );
  }
});

test('React SSR rendering check: LanguageProvider, MemoryRouter, and LoginForm render without hardcoded credentials', async () => {
  const prevStorage = (globalThis as { localStorage?: Storage }).localStorage;
  const store = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => {
      store.clear();
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };

  try {
    const html = renderToStaticMarkup(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(
          MemoryRouter,
          { initialEntries: ['/login'] },
          React.createElement(
            Routes,
            null,
            React.createElement(Route, {
              path: '/login',
              element: React.createElement('div', null, 'sanctum-login-route'),
            })
          )
        )
      )
    );
    const { AuthProvider } = await import('../src/contexts/AuthContext');
    const loginHtml = renderToStaticMarkup(
      React.createElement(
        LanguageProvider,
        null,
        React.createElement(
          AuthProvider,
          null,
          React.createElement(LoginForm, null)
        )
      )
    );
    assert.match(loginHtml, /type="email"/);
    assert.match(loginHtml, /type="password"/);
    assert.doesNotMatch(loginHtml, /admin123|value="[^"]+@/);
    assert.match(html, /sanctum-login-route/);
  } finally {
    if (prevStorage === undefined) {
      delete (globalThis as { localStorage?: Storage }).localStorage;
    } else {
      (globalThis as { localStorage?: Storage }).localStorage = prevStorage;
    }
  }
});
