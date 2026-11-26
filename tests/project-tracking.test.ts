import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
  ProjectRecord,
  calculateClientOverallProgress,
  clampProgressPercentage,
  filterProjects,
  sanitizeProjectForClientView,
} from '../src/types/project';
import { createApiClient } from '../src/lib/apiClient';
import { evaluateRouteAccess } from '../src/components/auth/ProtectedRoute';
import { getAuthorizedNavItems } from '../src/pages/dashboard/DashboardLayout';
import { User } from '../src/types/auth';

test('clampProgressPercentage validates 0-100 progress bounds cleanly', () => {
  assert.equal(clampProgressPercentage(-25), 0);
  assert.equal(clampProgressPercentage(0), 0);
  assert.equal(clampProgressPercentage(47.6), 48);
  assert.equal(clampProgressPercentage(135), 100);
  assert.equal(clampProgressPercentage(Number.NaN), 0);
});

test('sanitizeProjectForClientView strips private internal notes and hidden tasks', () => {
  const rawProject: ProjectRecord = {
    id: 1,
    project_code: 'PRJ-001',
    client_id: 10,
    name: 'Brand Revamp',
    service_category: 'Branding',
    status: 'in_progress',
    priority: 'high',
    progress_percentage: 55,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    tasks: [
      {
        id: 1,
        project_id: 1,
        title: 'Approve moodboard',
        status: 'todo',
        is_client_visible: true,
      },
      {
        id: 2,
        project_id: 1,
        title: 'Internal contractor cost check',
        status: 'in_progress',
        is_client_visible: false,
      },
    ],
    updates: [
      {
        id: 1,
        project_id: 1,
        type: 'progress_update',
        title: 'Phase 1',
        body: 'Wireframes delivered.',
        is_internal: false,
        created_at: '2026-01-02T00:00:00Z',
      },
      {
        id: 2,
        project_id: 1,
        type: 'internal_note',
        title: 'Private Note',
        body: 'Secret internal margin discussion.',
        is_internal: true,
        created_at: '2026-01-02T01:00:00Z',
      },
    ],
  };

  const sanitized = sanitizeProjectForClientView(rawProject);
  assert.equal(sanitized.tasks?.length, 1);
  assert.equal(sanitized.tasks?.[0].title, 'Approve moodboard');
  assert.equal(sanitized.updates?.length, 1);
  assert.equal(sanitized.updates?.[0].body, 'Wireframes delivered.');
});

test('calculateClientOverallProgress & filterProjects compute metrics and search/filters accurately', () => {
  const projects: ProjectRecord[] = [
    {
      id: 1,
      project_code: 'PRJ-AAA',
      client_id: 10,
      name: 'Alpha Website',
      service_category: 'Web Engineering',
      status: 'completed',
      priority: 'high',
      progress_percentage: 100,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-05T00:00:00Z',
      milestones: [
        { id: 1, project_id: 1, title: 'Design', status: 'completed', sort_order: 1 },
        { id: 2, project_id: 1, title: 'Launch', status: 'completed', sort_order: 2 },
      ],
      updates: [],
    },
    {
      id: 2,
      project_code: 'PRJ-BBB',
      client_id: 10,
      name: 'Beta Ads Funnel',
      service_category: 'Performance Ads',
      status: 'waiting_for_client',
      priority: 'urgent',
      progress_percentage: 50,
      created_at: '2026-01-03T00:00:00Z',
      updated_at: '2026-01-06T00:00:00Z',
      milestones: [
        { id: 3, project_id: 2, title: 'Audit', status: 'completed', sort_order: 1 },
        { id: 4, project_id: 2, title: 'Creatives', status: 'in_progress', sort_order: 2 },
      ],
      updates: [
        {
          id: 9,
          project_id: 2,
          type: 'approval_request',
          body: 'Approve ad creatives',
          is_internal: false,
          approval_status: 'pending',
          created_at: '2026-01-06T00:00:00Z',
        },
      ],
    },
  ];

  const summary = calculateClientOverallProgress(projects);
  assert.equal(summary.totalProjects, 2);
  assert.equal(summary.completedProjects, 1);
  assert.equal(summary.waitingForClientProjects, 1);
  assert.equal(summary.averageProgress, 75);
  assert.equal(summary.totalMilestones, 4);
  assert.equal(summary.completedMilestones, 3);
  assert.equal(summary.pendingApprovalsCount, 1);

  assert.equal(filterProjects(projects, { search: 'PRJ-BBB' }).length, 1);
  assert.equal(filterProjects(projects, { status: 'completed' })[0].id, 1);
  assert.equal(filterProjects(projects, { priority: 'urgent' })[0].id, 2);
});

test('Project route & nav RBAC protects /dashboard/projects for view_projects/manage_projects only', () => {
  const clientUser: User = {
    id: 1,
    name: 'Client',
    email: 'c@example.com',
    role: 'client',
    permissions: [],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };
  const projectViewer: User = {
    id: 2,
    name: 'Viewer',
    email: 'pv@example.com',
    role: 'custom_admin',
    permissions: ['view_projects'],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };
  const leadsOnly: User = {
    id: 3,
    name: 'Leads',
    email: 'leads@example.com',
    role: 'custom_admin',
    permissions: ['view_leads'],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };

  assert.equal(
    evaluateRouteAccess({
      user: clientUser,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_projects', 'manage_projects'],
    }),
    'forbidden'
  );
  assert.equal(
    evaluateRouteAccess({
      user: leadsOnly,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_projects', 'manage_projects'],
    }),
    'forbidden'
  );
  assert.equal(
    evaluateRouteAccess({
      user: projectViewer,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_projects', 'manage_projects'],
    }),
    'allowed'
  );

  assert.equal(
    getAuthorizedNavItems(projectViewer).some((i) => i.id === 'projects'),
    true
  );
  assert.equal(
    getAuthorizedNavItems(leadsOnly).some((i) => i.id === 'projects'),
    false
  );
});

test('End-to-end project ownership across two separate clients, milestone updates, progress validation, and private notes filtering', async () => {
  type Actor = 'super_admin' | 'client_a' | 'client_b';
  let actor: Actor = 'super_admin';

  const dbProjects: ProjectRecord[] = [
    {
      id: 101,
      project_code: 'PRJ-101',
      client_id: 1,
      name: 'Client A Growth Portal',
      service_category: 'Web Engineering',
      status: 'in_progress',
      priority: 'high',
      progress_percentage: 40,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      milestones: [
        { id: 1, project_id: 101, title: 'Architecture', status: 'completed', sort_order: 1 },
        { id: 2, project_id: 101, title: 'QA & Launch', status: 'pending', sort_order: 2 },
      ],
      tasks: [
        { id: 10, project_id: 101, title: 'Client Copy Review', status: 'todo', is_client_visible: true },
        { id: 11, project_id: 101, title: 'Internal Margin Check', status: 'todo', is_client_visible: false },
      ],
      updates: [
        {
          id: 50,
          project_id: 101,
          type: 'internal_note',
          title: 'Private Note',
          body: 'Confidential internal margin note',
          is_internal: true,
          created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 51,
          project_id: 101,
          type: 'approval_request',
          title: 'Sign-off Staging',
          body: 'Please approve staging release.',
          is_internal: false,
          approval_status: 'pending',
          created_at: '2026-01-02T00:00:00Z',
        },
      ],
    },
    {
      id: 202,
      project_code: 'PRJ-202',
      client_id: 2,
      name: 'Client B SEO Campaign',
      service_category: 'SEO',
      status: 'planning',
      priority: 'medium',
      progress_percentage: 10,
      created_at: '2026-01-02T00:00:00Z',
      updated_at: '2026-01-02T00:00:00Z',
      milestones: [],
      tasks: [],
      updates: [],
    },
  ];

  const readJsonBody = (req: http.IncomingMessage): Promise<Record<string, unknown>> =>
    new Promise((resolve) => {
      let body = '';
      req.on('data', (c) => {
        body += c;
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
      res.writeHead(204, { 'Set-Cookie': ['XSRF-TOKEN=prj-xsrf; Path=/'] });
      res.end();
      return;
    }

    // Client endpoints derive client strictly from session actor (ignore any ?client_id param)
    if (pathname.startsWith('/api/client/projects')) {
      if (actor === 'super_admin') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Client account required.' }));
        return;
      }
      const derivedClientId = actor === 'client_a' ? 1 : 2;

      if (req.method === 'GET' && pathname === '/api/client/projects') {
        const owned = dbProjects
          .filter((p) => p.client_id === derivedClientId)
          .map(sanitizeProjectForClientView);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: owned }));
        return;
      }

      const showMatch = pathname.match(/^\/api\/client\/projects\/(\d+)$/);
      if (req.method === 'GET' && showMatch) {
        const project = dbProjects.find((p) => p.id === Number(showMatch[1]));
        if (!project || project.client_id !== derivedClientId) {
          res.writeHead(403, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Forbidden: project ownership mismatch.' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: sanitizeProjectForClientView(project) }));
        return;
      }

      const approvalMatch = pathname.match(/^\/api\/client\/projects\/(\d+)\/approvals\/(\d+)\/respond$/);
      if (req.method === 'POST' && approvalMatch) {
        const project = dbProjects.find((p) => p.id === Number(approvalMatch[1]));
        if (!project || project.client_id !== derivedClientId) {
          res.writeHead(403);
          res.end();
          return;
        }
        const body = await readJsonBody(req);
        const upd = project.updates?.find((u) => u.id === Number(approvalMatch[2]));
        if (upd) {
          upd.approval_status = body.decision === 'approved' ? 'approved' : 'changes_requested';
        }
        project.status = body.decision === 'approved' ? 'in_progress' : 'under_review';
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: sanitizeProjectForClientView(project) }));
        return;
      }
    }

    // Admin endpoints
    if (pathname.startsWith('/api/projects')) {
      if (actor !== 'super_admin') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Forbidden' }));
        return;
      }

      if (req.method === 'POST' && pathname === '/api/projects') {
        const body = await readJsonBody(req);
        const progress = Number(body.progress_percentage ?? 0);
        if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
          res.writeHead(422, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'Progress must be between 0 and 100.' }));
          return;
        }
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: dbProjects[0] }));
        return;
      }

      const reorderMatch = pathname.match(/^\/api\/projects\/(\d+)\/milestones\/reorder$/);
      if (req.method === 'PUT' && reorderMatch) {
        const project = dbProjects.find((p) => p.id === Number(reorderMatch[1]));
        const body = await readJsonBody(req);
        const ids = Array.isArray(body.milestone_ids) ? body.milestone_ids.map(Number) : [];
        if (project?.milestones) {
          project.milestones.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
          project.milestones.forEach((m, i) => {
            m.sort_order = i + 1;
          });
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: project }));
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
    // 1. Progress validation rejects >100 with 422
    await client.get('/sanctum/csrf-cookie');
    await assert.rejects(
      () =>
        client.post('/api/projects', {
          client_id: 1,
          name: 'Invalid Progress Project',
          service_category: 'Web',
          progress_percentage: 140,
        }),
      (err: { response?: { status?: number } }) => err.response?.status === 422
    );

    // 2. Admin reorders milestones
    const reorderRes = await client.put('/api/projects/101/milestones/reorder', {
      milestone_ids: [2, 1],
    });
    assert.deepEqual(
      reorderRes.data.data.milestones.map((m: { id: number }) => m.id),
      [2, 1]
    );

    // 3. Client A queries /api/client/projects?client_id=2 -> still gets ONLY Client A's project 101 without internal notes or hidden tasks
    actor = 'client_a';
    const clientAList = await client.get('/api/client/projects?client_id=2');
    assert.equal(clientAList.data.data.length, 1);
    assert.equal(clientAList.data.data[0].id, 101);
    assert.equal(clientAList.data.data[0].tasks.length, 1);
    assert.equal(clientAList.data.data[0].updates.length, 1);
    assert.equal(
      JSON.stringify(clientAList.data.data).includes('Confidential internal margin note'),
      false
    );

    // 4. Client A cannot access Client B's project 202 (403)
    await assert.rejects(
      () => client.get('/api/client/projects/202'),
      (err: { response?: { status?: number } }) => err.response?.status === 403
    );

    // 5. Client B sees ONLY Project 202 and cannot access admin routes (403)
    actor = 'client_b';
    const clientBList = await client.get('/api/client/projects');
    assert.equal(clientBList.data.data.length, 1);
    assert.equal(clientBList.data.data[0].id, 202);
    await assert.rejects(
      () => client.post('/api/projects', { client_id: 2, name: 'Rogue', service_category: 'SEO' }),
      (err: { response?: { status?: number } }) => err.response?.status === 403
    );

    // 6. Client A records revision request on pending approval
    actor = 'client_a';
    const decisionRes = await client.post('/api/client/projects/101/approvals/51/respond', {
      decision: 'changes_requested',
      comment: 'Please adjust hero typography.',
    });
    assert.equal(decisionRes.data.data.status, 'under_review');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Project frontend modules contain no localStorage persistence for business/project data', () => {
  const root = path.resolve(process.cwd());
  const files = [
    'src/types/project.ts',
    'src/contexts/ProjectsContext.tsx',
    'src/pages/dashboard/ProjectsPage.tsx',
    'src/components/client/ClientOverallProgress.tsx',
    'src/components/client/ClientProjectStatus.tsx',
  ];

  for (const rel of files) {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(/localStorage\.(setItem|getItem)/.test(content), false, `${rel} must not use localStorage`);
  }
});
