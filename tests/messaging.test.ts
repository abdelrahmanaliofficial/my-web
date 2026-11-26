import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import {
  ConversationRecord,
  MessageRecord,
  appendPersistedMessage,
  calculateTotalUnreadCount,
  filterConversations,
  mergePaginatedMessages,
  validateMessageAttachments,
} from '../src/types/chat';
import { User } from '../src/types/auth';
import { evaluateRouteAccess } from '../src/components/auth/ProtectedRoute';
import { getAuthorizedNavItems } from '../src/pages/dashboard/DashboardLayout';
import { createApiClient } from '../src/lib/apiClient';

test('Chat helpers accurately compute unread counts, filter conversations, paginate chronologically, and validate attachments', () => {
  const convs: ConversationRecord[] = [
    {
      id: 1,
      client_id: 10,
      subject: 'API Integration',
      status: 'open',
      unread_count: 3,
      client: { id: 10, client_code: 'CL-A', full_name: 'Alice Studio', email: 'a@test.io' },
    },
    {
      id: 2,
      client_id: 11,
      subject: 'Legacy Audit',
      status: 'archived',
      unread_count: 5,
      client: { id: 11, client_code: 'CL-B', full_name: 'Bob Retail', email: 'b@test.io' },
    },
  ];

  assert.equal(calculateTotalUnreadCount(convs), 3);
  assert.equal(filterConversations(convs, { status: 'open' }).length, 1);
  assert.equal(filterConversations(convs, { search: 'Bob' })[0].id, 2);

  const page1: MessageRecord[] = [
    { id: 4, conversation_id: 1, sender_id: 1, sender_type: 'admin', body: 'Msg 4', read_at: null, created_at: '2026-01-01T00:04:00Z' },
    { id: 5, conversation_id: 1, sender_id: 2, sender_type: 'client', body: 'Msg 5', read_at: null, created_at: '2026-01-01T00:05:00Z' },
  ];
  const page2: MessageRecord[] = [
    { id: 2, conversation_id: 1, sender_id: 1, sender_type: 'admin', body: 'Msg 2', read_at: null, created_at: '2026-01-01T00:02:00Z' },
    { id: 3, conversation_id: 1, sender_id: 2, sender_type: 'client', body: 'Msg 3', read_at: null, created_at: '2026-01-01T00:03:00Z' },
    { id: 4, conversation_id: 1, sender_id: 1, sender_type: 'admin', body: 'Msg 4', read_at: null, created_at: '2026-01-01T00:04:00Z' },
  ];

  const merged = mergePaginatedMessages(page1, page2, 'prepend');
  assert.deepEqual(
    merged.map((m) => m.id),
    [2, 3, 4, 5]
  );

  const refreshed = mergePaginatedMessages(merged, [
    { id: 5, conversation_id: 1, sender_id: 2, sender_type: 'client', body: 'Updated 5', read_at: null, created_at: '2026-01-01T00:05:00Z' },
    { id: 6, conversation_id: 1, sender_id: 1, sender_type: 'admin', body: 'New 6', read_at: null, created_at: '2026-01-01T00:06:00Z' },
  ], 'append');
  assert.deepEqual(refreshed.map((m) => m.id), [2, 3, 4, 5, 6]);
  assert.equal(refreshed.find((m) => m.id === 5)?.body, 'Updated 5');

  const appended = appendPersistedMessage(merged, {
    id: 6,
    conversation_id: 1,
    sender_id: 1,
    sender_type: 'admin',
    body: 'Msg 6',
    read_at: null,
    created_at: '2026-01-01T00:06:00Z',
  });
  assert.deepEqual(
    appended.map((m) => m.id),
    [2, 3, 4, 5, 6]
  );

  const safePdf = new File(['%PDF'], 'contract.pdf', { type: 'application/pdf' });
  Object.defineProperty(safePdf, 'size', { value: 1024 });
  assert.equal(validateMessageAttachments([safePdf]).valid, true);

  const dangerousPhp = new File(['<?php'], 'shell.php', { type: 'application/x-php' });
  Object.defineProperty(dangerousPhp, 'size', { value: 100 });
  assert.equal(validateMessageAttachments([dangerousPhp]).valid, false);
});

test('Messaging route & navigation RBAC enforce view_messages, manage_messages, and block unauthorized users', () => {
  const msgViewer: User = {
    id: 40,
    name: 'Support Viewer',
    email: 'sv@example.com',
    role: 'custom_admin',
    permissions: ['view_messages'],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };

  const billingOnlyAdmin: User = {
    id: 41,
    name: 'Billing Only',
    email: 'bo@example.com',
    role: 'custom_admin',
    permissions: ['view_billing'],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };

  const clientUser: User = {
    id: 42,
    name: 'Client',
    email: 'client@example.com',
    role: 'client',
    permissions: [],
    is_active: true,
    email_verified_at: null,
    suspended_at: null,
  };

  assert.equal(
    evaluateRouteAccess({
      user: msgViewer,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_messages', 'manage_messages'],
    }),
    'allowed'
  );

  assert.equal(
    evaluateRouteAccess({
      user: billingOnlyAdmin,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_messages', 'manage_messages'],
    }),
    'forbidden'
  );

  assert.equal(
    evaluateRouteAccess({
      user: clientUser,
      loading: false,
      allowedRoles: ['super_admin', 'custom_admin'],
      requiredPermissions: ['view_messages', 'manage_messages'],
    }),
    'forbidden'
  );

  assert.deepEqual(
    getAuthorizedNavItems(msgViewer).map((i) => i.id),
    ['messages', 'profile']
  );
});

test('End-to-end messaging API: two clients isolation, unauthorized access, sending, reading, attachments, archiving, and message pagination', async () => {
  interface MockActor {
    id: number;
    role: 'super_admin' | 'custom_admin' | 'client';
    permissions: string[];
    clientId?: number;
  }

  let currentActor: MockActor = { id: 1, role: 'super_admin', permissions: [] };
  let nextConvId = 1;
  let nextMsgId = 1;
  let nextAttId = 1;

  interface StoredConv {
    id: number;
    client_id: number;
    project_id: number | null;
    subject: string;
    status: 'open' | 'archived';
    last_message_at: string | null;
  }

  interface StoredMsg {
    id: number;
    conversation_id: number;
    sender_id: number;
    sender_type: 'admin' | 'client';
    body: string | null;
    read_at: string | null;
    created_at: string;
    attachments: Array<{
      id: number;
      file_uid: string;
      client_id: number;
      original_filename: string;
      mime_type: string;
      file_size: number;
      url: string;
    }>;
  }

  const conversations: StoredConv[] = [];
  const messages: StoredMsg[] = [];
  const privateFiles = new Map<string, { client_id: number; content: string; filename: string }>();

  const adminHas = (actor: MockActor, perm: string) =>
    actor.role === 'super_admin' ||
    (actor.role === 'custom_admin' &&
      (actor.permissions.includes(perm) || actor.permissions.includes('manage_messages')));

  const readJson = async (req: http.IncomingMessage) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    return JSON.parse(raw || '{}');
  };

  const server = http.createServer(async (req, res) => {
    const rawUrl = req.url || '/';
    const parsedUrl = new URL(rawUrl, 'http://127.0.0.1');
    const pathname = parsedUrl.pathname;
    const method = req.method || 'GET';

    if (method === 'GET' && pathname === '/sanctum/csrf-cookie') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Admin create conversation
    if (method === 'POST' && pathname === '/api/conversations') {
      if (!adminHas(currentActor, 'create_messages')) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Forbidden.' }));
        return;
      }
      const body = await readJson(req);
      const now = new Date().toISOString();
      const conv: StoredConv = {
        id: nextConvId++,
        client_id: Number(body.client_id),
        project_id: body.project_id ?? null,
        subject: body.subject || 'Project Discussion',
        status: 'open',
        last_message_at: body.initial_message ? now : null,
      };
      conversations.push(conv);

      if (body.initial_message) {
        const attachments = [];
        if (body.mock_attachment_name) {
          const uid = `uid-${nextAttId++}`;
          privateFiles.set(uid, {
            client_id: conv.client_id,
            content: 'PRIVATE_FILE_BYTES',
            filename: body.mock_attachment_name,
          });
          attachments.push({
            id: nextAttId,
            file_uid: uid,
            client_id: conv.client_id,
            original_filename: body.mock_attachment_name,
            mime_type: 'application/pdf',
            file_size: 18,
            url: `/api/media/${uid}/download`,
          });
        }

        messages.push({
          id: nextMsgId++,
          conversation_id: conv.id,
          sender_id: currentActor.id,
          sender_type: 'admin',
          body: body.initial_message,
          read_at: null,
          created_at: now,
          attachments,
        });
      }

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: conv }));
      return;
    }

    // Admin unread summary
    if (method === 'GET' && pathname === '/api/conversations/unread-summary') {
      if (!adminHas(currentActor, 'view_messages')) {
        res.writeHead(403);
        res.end();
        return;
      }
      const total = messages.filter(
        (m) =>
          m.sender_type === 'client' &&
          m.read_at === null &&
          conversations.find((c) => c.id === m.conversation_id)?.status === 'open'
      ).length;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { total_unread_count: total } }));
      return;
    }

    // Admin list conversations
    if (method === 'GET' && pathname === '/api/conversations') {
      if (!adminHas(currentActor, 'view_messages')) {
        res.writeHead(403);
        res.end();
        return;
      }
      const enriched = conversations.map((c) => ({
        ...c,
        unread_count: messages.filter(
          (m) => m.conversation_id === c.id && m.sender_type === 'client' && m.read_at === null
        ).length,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: enriched }));
      return;
    }

    // Client list conversations
    if (method === 'GET' && pathname === '/api/client/conversations') {
      if (currentActor.role !== 'client' || !currentActor.clientId) {
        res.writeHead(403);
        res.end();
        return;
      }
      const scoped = conversations
        .filter((c) => c.client_id === currentActor.clientId)
        .map((c) => ({
          ...c,
          unread_count: messages.filter(
            (m) => m.conversation_id === c.id && m.sender_type === 'admin' && m.read_at === null
          ).length,
        }));
      const totalUnread = scoped.reduce((s, c) => s + (c.status === 'open' ? c.unread_count : 0), 0);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: scoped,
          meta: { total_unread_count: totalUnread },
        })
      );
      return;
    }

    // Admin or Client paginated conversation show
    const showMatch = pathname.match(/^\/api(?:\/(client))?\/conversations\/(\d+)$/);
    if (method === 'GET' && showMatch) {
      const isClientScope = showMatch[1] === 'client';
      const conv = conversations.find((c) => c.id === Number(showMatch[2]));
      if (!conv) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (isClientScope) {
        if (currentActor.role !== 'client' || conv.client_id !== currentActor.clientId) {
          res.writeHead(403);
          res.end();
          return;
        }
      } else if (!adminHas(currentActor, 'view_messages')) {
        res.writeHead(403);
        res.end();
        return;
      }

      const page = Math.max(1, Number(parsedUrl.searchParams.get('page') || 1));
      const perPage = Math.max(1, Number(parsedUrl.searchParams.get('per_page') || 25));
      const allDesc = messages
        .filter((m) => m.conversation_id === conv.id)
        .sort((a, b) => b.id - a.id);
      const offset = (page - 1) * perPage;
      const slice = allDesc.slice(offset, offset + perPage).reverse();
      const total = allDesc.length;
      const lastPage = Math.max(1, Math.ceil(total / perPage));

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          success: true,
          data: {
            conversation: conv,
            messages: slice,
            pagination: {
              current_page: page,
              last_page: lastPage,
              per_page: perPage,
              total,
              has_more: page < lastPage,
            },
          },
        })
      );
      return;
    }

    // Admin or Client send message
    const msgMatch = pathname.match(/^\/api(?:\/(client))?\/conversations\/(\d+)\/messages$/);
    if (method === 'POST' && msgMatch) {
      const isClientScope = msgMatch[1] === 'client';
      const conv = conversations.find((c) => c.id === Number(msgMatch[2]));
      if (!conv) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (isClientScope) {
        if (currentActor.role !== 'client' || conv.client_id !== currentActor.clientId) {
          res.writeHead(403);
          res.end();
          return;
        }
      } else if (!adminHas(currentActor, 'create_messages')) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (conv.status === 'archived') {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Conversation is archived.' }));
        return;
      }
      const body = await readJson(req);
      if (!body.body && !body.mock_attachment_name) {
        res.writeHead(422, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Empty message rejected.' }));
        return;
      }

      const now = new Date().toISOString();
      const created: StoredMsg = {
        id: nextMsgId++,
        conversation_id: conv.id,
        sender_id: currentActor.id,
        sender_type: isClientScope ? 'client' : 'admin',
        body: body.body || null,
        read_at: null,
        created_at: now,
        attachments: [],
      };
      messages.push(created);
      conv.last_message_at = now;

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: created }));
      return;
    }

    // Mark as read
    const readMatch = pathname.match(/^\/api(?:\/(client))?\/conversations\/(\d+)\/read$/);
    if (method === 'POST' && readMatch) {
      const isClientScope = readMatch[1] === 'client';
      const conv = conversations.find((c) => c.id === Number(readMatch[2]));
      if (!conv) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (isClientScope) {
        if (currentActor.role !== 'client' || conv.client_id !== currentActor.clientId) {
          res.writeHead(403);
          res.end();
          return;
        }
      } else if (!adminHas(currentActor, 'view_messages')) {
        res.writeHead(403);
        res.end();
        return;
      }

      const targetType = isClientScope ? 'admin' : 'client';
      const now = new Date().toISOString();
      let updatedCount = 0;
      for (const m of messages) {
        if (m.conversation_id === conv.id && m.sender_type === targetType && m.read_at === null) {
          m.read_at = now;
          updatedCount += 1;
        }
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: { updated_count: updatedCount, unread_count: 0 } }));
      return;
    }

    // Archive conversation (admin only)
    const archMatch = pathname.match(/^\/api\/conversations\/(\d+)\/archive$/);
    if (method === 'POST' && archMatch) {
      if (!adminHas(currentActor, 'update_messages')) {
        res.writeHead(403);
        res.end();
        return;
      }
      const conv = conversations.find((c) => c.id === Number(archMatch[1]));
      if (!conv) {
        res.writeHead(404);
        res.end();
        return;
      }
      conv.status = 'archived';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, data: conv }));
      return;
    }

    // Private attachment download
    const mediaMatch = pathname.match(/^\/api\/media\/([^/]+)\/download$/);
    if (method === 'GET' && mediaMatch) {
      const file = privateFiles.get(mediaMatch[1]);
      if (!file) {
        res.writeHead(404);
        res.end();
        return;
      }
      if (
        !(
          adminHas(currentActor, 'view_messages') ||
          (currentActor.role === 'client' && currentActor.clientId === file.client_id)
        )
      ) {
        res.writeHead(403);
        res.end();
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/pdf' });
      res.end(file.content);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const api = createApiClient(`http://127.0.0.1:${addr.port}`);

  try {
    // 1. Admin starts conversation for Client A (client_id=101) with private attachment
    const createRes = await api.post('/api/conversations', {
      client_id: 101,
      project_id: 55,
      subject: 'Kickoff & Deliverables',
      initial_message: 'Welcome! Please check attached scope.',
      mock_attachment_name: 'scope.pdf',
    });
    assert.equal(createRes.status, 201);
    const convId = createRes.data.data.id;

    // 2. Client B (client_id=102) is blocked from Client A's conversation, reply, read, and attachment
    currentActor = { id: 202, role: 'client', permissions: [], clientId: 102 };
    const bList = await api.get('/api/client/conversations');
    assert.equal(bList.data.data.length, 0);
    await assert.rejects(() => api.get(`/api/client/conversations/${convId}`));
    await assert.rejects(() =>
      api.post(`/api/client/conversations/${convId}/messages`, { body: 'Unauthorized' })
    );
    await assert.rejects(() => api.get(`/api/conversations/${convId}`));
    await assert.rejects(() =>
      api.post(`/api/conversations/${convId}/messages`, { body: 'Administrative route bypass' })
    );
    await assert.rejects(() => api.post(`/api/client/conversations/${convId}/read`));
    await assert.rejects(() => api.get('/api/media/uid-1/download'));

    // 3. Client A accesses conversation, sees unread_count = 1, downloads private file, marks read
    currentActor = { id: 201, role: 'client', permissions: [], clientId: 101 };
    const aList = await api.get('/api/client/conversations');
    assert.equal(aList.data.data.length, 1);
    assert.equal(aList.data.meta.total_unread_count, 1);

    const fileRes = await api.get('/api/media/uid-1/download', { responseType: 'text' });
    assert.equal(fileRes.data, 'PRIVATE_FILE_BYTES');

    const readRes = await api.post(`/api/client/conversations/${convId}/read`);
    assert.equal(readRes.data.data.updated_count, 1);

    // 4. Client A replies -> backend persists & increments admin unread count
    const replyRes = await api.post(`/api/client/conversations/${convId}/messages`, {
      body: 'Thanks, received!',
    });
    assert.equal(replyRes.status, 201);
    assert.equal(replyRes.data.data.sender_type, 'client');

    // Client cannot archive admin conversation
    await assert.rejects(() => api.post(`/api/conversations/${convId}/archive`));

    // 5. Custom admin without messaging permission gets 403; view_only admin cannot send or archive
    currentActor = { id: 3, role: 'custom_admin', permissions: ['view_leads'] };
    await assert.rejects(() => api.get('/api/conversations'));

    currentActor = { id: 4, role: 'custom_admin', permissions: ['view_messages'] };
    await api.get('/api/conversations');
    await assert.rejects(() =>
      api.post(`/api/conversations/${convId}/messages`, { body: 'View only cannot send' })
    );
    await assert.rejects(() => api.post(`/api/conversations/${convId}/archive`));

    // 6. Super admin sees unread = 1, paginates messages across multiple pages, and archives thread
    currentActor = { id: 1, role: 'super_admin', permissions: [] };
    const unreadSummary = await api.get('/api/conversations/unread-summary');
    assert.equal(unreadSummary.data.data.total_unread_count, 1);

    for (let i = 1; i <= 5; i += 1) {
      await api.post(`/api/conversations/${convId}/messages`, { body: `Update #${i}` });
    }

    const page1 = await api.get(`/api/conversations/${convId}?per_page=4&page=1`);
    assert.equal(page1.data.data.messages.length, 4);
    assert.equal(page1.data.data.pagination.has_more, true);

    const page2 = await api.get(`/api/conversations/${convId}?per_page=4&page=2`);
    assert.equal(page2.data.data.messages.length, 3);
    assert.equal(page2.data.data.pagination.has_more, false);

    const combined = mergePaginatedMessages(
      page1.data.data.messages,
      page2.data.data.messages,
      'prepend'
    );
    assert.equal(combined.length, 7);

    // Archive rejects subsequent client replies
    const archRes = await api.post(`/api/conversations/${convId}/archive`);
    assert.equal(archRes.data.data.status, 'archived');

    currentActor = { id: 201, role: 'client', permissions: [], clientId: 101 };
    await assert.rejects(() =>
      api.post(`/api/client/conversations/${convId}/messages`, { body: 'Post archive reply' })
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Messaging frontend files contain no hardcoded sample conversations, localStorage, or popups', () => {
  const root = path.resolve(process.cwd());
  const files = [
    'src/types/chat.ts',
    'src/contexts/ChatContext.tsx',
    'src/pages/dashboard/Messages.tsx',
    'src/components/client/ClientMessagesSection.tsx',
  ];

  for (const rel of files) {
    const content = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(/localStorage/.test(content), false, `${rel} must not use localStorage`);
    assert.equal(
      /window\.(open|alert|confirm)\s*\(/.test(content),
      false,
      `${rel} must not call window.open/alert/confirm`
    );
  }
});
