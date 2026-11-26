import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  isPermanentFileReference,
  sanitizePersistedMediaUrl,
  validateUploadFile,
  MediaFileMetadata,
} from '../src/types/media';
import {
  createMediaService,
  createTemporaryPreviewUrl,
  revokeTemporaryPreviewUrl,
} from '../src/services/mediaService';
import { createApiClient } from '../src/lib/apiClient';

test('validateUploadFile blocks executables, double extensions, SVG, traversal, MIME mismatch, and oversized files', () => {
  assert.equal(validateUploadFile({ name: 'shell.php', type: 'application/x-php', size: 100 }, 'public').valid, false);
  assert.equal(validateUploadFile({ name: 'avatar.php.png', type: 'image/png', size: 1024 }, 'public').valid, false);
  assert.equal(validateUploadFile({ name: 'vector.svg', type: 'image/svg+xml', size: 1024 }, 'public').valid, false);
  assert.equal(validateUploadFile({ name: 'payload.exe', type: 'application/octet-stream', size: 512 }, 'private').valid, false);
  assert.equal(validateUploadFile({ name: '../../.env.png', type: 'image/png', size: 512 }, 'public').valid, false);
  assert.equal(validateUploadFile({ name: 'fake.png', type: 'application/pdf', size: 512 }, 'public').valid, false);
  assert.equal(validateUploadFile({ name: 'huge.png', type: 'image/png', size: 6 * 1024 * 1024 }, 'public').valid, false);
  assert.equal(validateUploadFile({ name: 'empty.pdf', type: 'application/pdf', size: 0 }, 'private').valid, false);

  assert.equal(validateUploadFile({ name: 'brand-logo.png', type: 'image/png', size: 25_000 }, 'public').valid, true);
  assert.equal(validateUploadFile({ name: 'hero.mp4', type: 'video/mp4', size: 10 * 1024 * 1024 }, 'public').valid, true);
  assert.equal(validateUploadFile({ name: 'contract.pdf', type: 'application/pdf', size: 2 * 1024 * 1024 }, 'private').valid, true);
});

test('isPermanentFileReference and sanitizePersistedMediaUrl reject blob:, data: Base64, and unsafe schemes', () => {
  assert.equal(isPermanentFileReference('blob:http://localhost:3000/1234-5678'), false);
  assert.equal(isPermanentFileReference('data:image/png;base64,iVBORw0KGgo='), false);
  assert.equal(isPermanentFileReference('javascript:alert(1)'), false);
  assert.equal(isPermanentFileReference('/storage/../etc/passwd'), false);
  assert.equal(sanitizePersistedMediaUrl('blob:http://localhost:3000/temp'), '');
  assert.equal(sanitizePersistedMediaUrl('data:image/png;base64,abc'), '');

  assert.equal(isPermanentFileReference('/storage/public-assets/site_logo/2026/01/logo.png'), true);
  assert.equal(isPermanentFileReference('/api/media/abc-123/download'), true);
  assert.equal(isPermanentFileReference('https://cdn.example.com/assets/logo.webp'), true);
  assert.equal(
    sanitizePersistedMediaUrl('  /storage/public-assets/site_logo/2026/01/logo.png  '),
    '/storage/public-assets/site_logo/2026/01/logo.png'
  );
});

test('temporary Object URL preview helper creates blob: URLs and revokes them deterministically', () => {
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const created: string[] = [];
  const revoked: string[] = [];

  URL.createObjectURL = () => {
    const u = 'blob:http://localhost:3000/mock-preview-1';
    created.push(u);
    return u;
  };
  URL.revokeObjectURL = (u: string) => {
    revoked.push(u);
  };

  try {
    const handle = createTemporaryPreviewUrl(new Blob(['pngdata'], { type: 'image/png' }));
    assert.equal(handle.objectUrl, 'blob:http://localhost:3000/mock-preview-1');
    assert.equal(isPermanentFileReference(handle.objectUrl), false);

    handle.revoke();
    handle.revoke(); // idempotent double-revoke
    assert.deepEqual(revoked, ['blob:http://localhost:3000/mock-preview-1']);

    revokeTemporaryPreviewUrl('https://cdn.example.com/logo.png'); // never revokes permanent URLs
    assert.equal(revoked.length, 1);
  } finally {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});

function parseMultipartSingleFile(rawBody: Buffer, contentType: string): {
  fields: Record<string, string>;
  file?: { filename: string; mimeType: string; data: Buffer };
} {
  const match = contentType.match(/boundary=([^\s;]+)/i);
  if (!match) return { fields: {} };
  const boundary = match[1].replace(/^"|"$/g, '');
  const text = rawBody.toString('latin1');
  const parts = text.split(`--${boundary}`);
  const fields: Record<string, string> = {};
  let file: { filename: string; mimeType: string; data: Buffer } | undefined;

  for (const part of parts) {
    if (!part || part === '--\r\n' || part === '--') continue;
    const headerEnd = part.indexOf('\r\n\r\n');
    if (headerEnd === -1) continue;
    const rawHeaders = part.slice(0, headerEnd);
    const bodyLatin1 = part.slice(headerEnd + 4, part.endsWith('\r\n') ? -2 : undefined);
    const nameMatch = rawHeaders.match(/name="([^"]+)"/i);
    if (!nameMatch) continue;
    const fieldName = nameMatch[1];
    const filenameMatch = rawHeaders.match(/filename="([^"]+)"/i);
    if (filenameMatch) {
      const mimeMatch = rawHeaders.match(/Content-Type:\s*([^\r\n]+)/i);
      file = {
        filename: filenameMatch[1],
        mimeType: (mimeMatch?.[1] || 'application/octet-stream').trim().toLowerCase(),
        data: Buffer.from(bodyLatin1, 'latin1'),
      };
    } else {
      fields[fieldName] = Buffer.from(bodyLatin1, 'latin1').toString('utf8').trim();
    }
  }

  return { fields, file };
}

function createDiskBackedMediaServer(storageRoot: string) {
  const metaPath = path.join(storageRoot, 'media_files.json');
  const publicRoot = path.join(storageRoot, 'disks', 'public');
  const privateRoot = path.join(storageRoot, 'disks', 'local');
  fs.mkdirSync(publicRoot, { recursive: true });
  fs.mkdirSync(privateRoot, { recursive: true });

  const loadRecords = (): MediaFileMetadata[] => {
    if (!fs.existsSync(metaPath)) return [];
    return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  };
  const saveRecords = (records: MediaFileMetadata[]) => {
    fs.writeFileSync(metaPath, JSON.stringify(records, null, 2));
  };

  let nextId = loadRecords().reduce((m, r) => Math.max(m, r.id), 0) + 1;
  const signingSecret = 'test-signing-key';

  const getUser = (req: http.IncomingMessage) => {
    const actorHeader = String(req.headers['x-test-user'] || 'admin');
    if (actorHeader === 'clientA') return { id: 101, role: 'client', clientId: 10 };
    if (actorHeader === 'clientB') return { id: 102, role: 'client', clientId: 20 };
    return { id: 1, role: 'super_admin', clientId: null };
  };

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = urlObj.pathname;
    const actor = getUser(req);

    if (req.method === 'GET' && pathname === '/sanctum/csrf-cookie') {
      res.writeHead(204, { 'Set-Cookie': 'XSRF-TOKEN=test-csrf-token; Path=/; SameSite=Lax' });
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks);

    const json = (status: number, payload: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    if (req.method === 'GET' && pathname === '/api/media') {
      const records = loadRecords().filter((r) => {
        if (actor.role === 'super_admin') return true;
        return r.visibility === 'public' || r.owner_id === actor.clientId;
      });
      return json(200, { data: records });
    }

    if (req.method === 'POST' && pathname === '/api/media') {
      const { fields, file } = parseMultipartSingleFile(rawBody, String(req.headers['content-type'] || ''));
      if (!file) return json(422, { message: 'Missing file.' });

      const visibility = fields.visibility === 'private' ? 'private' : 'public';
      const check = validateUploadFile(
        { name: file.filename, type: file.mimeType, size: file.data.length },
        visibility
      );
      if (!check.valid) return json(422, { message: check.error });

      if (visibility === 'public' && actor.role === 'client') {
        return json(403, { message: 'Clients cannot upload public site assets.' });
      }

      let resolvedOwnerType: string | null = null;
      let resolvedOwnerId: number | null = null;
      if (visibility === 'private') {
        const requestedOwnerId = fields.owner_id ? Number(fields.owner_id) : null;
        if (actor.role === 'client') {
          if (requestedOwnerId !== null && requestedOwnerId !== actor.clientId) {
            return json(403, { message: 'You cannot assign private files to another client account.' });
          }
          resolvedOwnerType = 'App\\Models\\Client';
          resolvedOwnerId = actor.clientId;
        } else {
          resolvedOwnerType = fields.owner_type === 'project' ? 'App\\Models\\Project' : 'App\\Models\\Client';
          resolvedOwnerId = requestedOwnerId;
        }
      }

      const fileUid = crypto.randomUUID();
      const storedFilename = `${fileUid}.${check.extension}`;
      const disk = visibility === 'public' ? 'public' : 'local';
      const dirRel =
        visibility === 'public'
          ? `public-assets/${fields.category || 'site_logo'}/2026/11`
          : `private-clients/${resolvedOwnerId}/project_document/2026/11`;
      const storagePath = `${dirRel}/${storedFilename}`;
      const diskBase = disk === 'public' ? publicRoot : privateRoot;
      fs.mkdirSync(path.join(diskBase, dirRel), { recursive: true });
      fs.writeFileSync(path.join(diskBase, storagePath), file.data);

      const record: MediaFileMetadata = {
        id: nextId++,
        file_uid: fileUid,
        visibility,
        category: fields.category || 'site_logo',
        original_filename: path.basename(file.filename),
        stored_filename: storedFilename,
        disk,
        storage_path: storagePath,
        mime_type: file.mimeType,
        extension: check.extension || 'bin',
        file_size: file.data.length,
        checksum_sha256: crypto.createHash('sha256').update(file.data).digest('hex'),
        owner_type: resolvedOwnerType,
        owner_id: resolvedOwnerId,
        uploaded_by: actor.id,
        url: visibility === 'public' ? `/storage/${storagePath}` : `/api/media/${fileUid}/download`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const records = loadRecords();
      records.push(record);
      saveRecords(records);
      return json(201, { data: record });
    }

    const signedDlMatch = pathname.match(/^\/api\/media\/signed\/([^/]+)$/);
    if (req.method === 'GET' && signedDlMatch) {
      const fileUid = decodeURIComponent(signedDlMatch[1]);
      const expires = Number(urlObj.searchParams.get('expires') || '0');
      const sig = urlObj.searchParams.get('signature') || '';
      const expected = crypto
        .createHmac('sha256', signingSecret)
        .update(`${fileUid}:${expires}`)
        .digest('hex');
      if (sig !== expected || Date.now() > expires) {
        return json(403, { message: 'Download link is invalid or has expired.' });
      }
      const record = loadRecords().find((r) => r.file_uid === fileUid);
      if (!record) return json(404, { message: 'Not found' });
      if (record.visibility === 'private' && actor.role === 'client' && record.owner_id !== actor.clientId) {
        return json(403, { message: 'Forbidden' });
      }
      const diskBase = record.disk === 'public' ? publicRoot : privateRoot;
      const bytes = fs.readFileSync(path.join(diskBase, record.storage_path));
      res.writeHead(200, {
        'Content-Type': record.mime_type,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store, max-age=0',
      });
      res.end(bytes);
      return;
    }

    const signedUrlMatch = pathname.match(/^\/api\/media\/([^/]+)\/signed-url$/);
    if (req.method === 'POST' && signedUrlMatch) {
      const fileUid = decodeURIComponent(signedUrlMatch[1]);
      const record = loadRecords().find((r) => r.file_uid === fileUid);
      if (!record) return json(404, { message: 'Not found' });
      if (record.visibility === 'private' && actor.role === 'client' && record.owner_id !== actor.clientId) {
        return json(403, { message: 'Forbidden' });
      }
      const expires = Date.now() + 5 * 60 * 1000;
      const sig = crypto
        .createHmac('sha256', signingSecret)
        .update(`${fileUid}:${expires}`)
        .digest('hex');
      const base = `http://${req.headers.host}`;
      return json(200, {
        data: {
          file_uid: fileUid,
          signed_url: `${base}/api/media/signed/${fileUid}?expires=${expires}&signature=${sig}`,
          expires_in_minutes: 5,
        },
      });
    }

    const replaceMatch = pathname.match(/^\/api\/media\/([^/]+)\/replace$/);
    if (req.method === 'POST' && replaceMatch) {
      const fileUid = decodeURIComponent(replaceMatch[1]);
      const records = loadRecords();
      const idx = records.findIndex((r) => r.file_uid === fileUid);
      if (idx === -1) return json(404, { message: 'Not found' });
      const existing = records[idx];
      if (existing.visibility === 'private' && actor.role === 'client' && existing.owner_id !== actor.clientId) {
        return json(403, { message: 'Forbidden' });
      }

      const { file } = parseMultipartSingleFile(rawBody, String(req.headers['content-type'] || ''));
      if (!file) return json(422, { message: 'Missing file.' });
      const check = validateUploadFile(
        { name: file.filename, type: file.mimeType, size: file.data.length },
        existing.visibility
      );
      if (!check.valid) return json(422, { message: check.error });

      const diskBase = existing.disk === 'public' ? publicRoot : privateRoot;
      const newStored = `${crypto.randomUUID()}.${check.extension}`;
      const newStoragePath = `${path.posix.dirname(existing.storage_path)}/${newStored}`;
      fs.writeFileSync(path.join(diskBase, newStoragePath), file.data);
      const oldFullPath = path.join(diskBase, existing.storage_path);
      if (fs.existsSync(oldFullPath)) fs.unlinkSync(oldFullPath);

      records[idx] = {
        ...existing,
        original_filename: path.basename(file.filename),
        stored_filename: newStored,
        storage_path: newStoragePath,
        file_size: file.data.length,
        updated_at: new Date().toISOString(),
      };
      saveRecords(records);
      return json(200, { data: records[idx] });
    }

    const itemMatch = pathname.match(/^\/api\/media\/([^/]+)$/);
    if (itemMatch) {
      const fileUid = decodeURIComponent(itemMatch[1]);
      const records = loadRecords();
      const idx = records.findIndex((r) => r.file_uid === fileUid);
      if (idx === -1) return json(404, { message: 'Not found' });
      const existing = records[idx];

      if (req.method === 'GET') {
        if (existing.visibility === 'private' && actor.role === 'client' && existing.owner_id !== actor.clientId) {
          return json(403, { message: 'Forbidden' });
        }
        return json(200, { data: existing });
      }

      if (req.method === 'DELETE') {
        if (existing.visibility === 'private' && actor.role === 'client' && existing.owner_id !== actor.clientId) {
          return json(403, { message: 'Forbidden' });
        }
        const diskBase = existing.disk === 'public' ? publicRoot : privateRoot;
        const fullPath = path.join(diskBase, existing.storage_path);
        if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        records.splice(idx, 1);
        saveRecords(records);
        return json(200, { message: 'File deleted successfully.' });
      }
    }

    return json(404, { message: 'Route not found' });
  });

  return server;
}

test('persistent media storage separates public/private disks, survives restart, and enforces authorization', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'media-storage-test-'));

  let server1 = createDiskBackedMediaServer(tmpRoot);
  await new Promise<void>((resolve) => server1.listen(0, '127.0.0.1', () => resolve()));

  try {
    const port1 = (server1.address() as { port: number }).port;
    const base1 = `http://127.0.0.1:${port1}`;

    const adminClient = createApiClient(base1);
    adminClient.defaults.headers.common['x-test-user'] = 'admin';
    const adminMedia = createMediaService(adminClient);

    const clientAClient = createApiClient(base1);
    clientAClient.defaults.headers.common['x-test-user'] = 'clientA';
    const clientAMedia = createMediaService(clientAClient);

    const clientBClient = createApiClient(base1);
    clientBClient.defaults.headers.common['x-test-user'] = 'clientB';
    const clientBMedia = createMediaService(clientBClient);

    // 1. Admin uploads public site logo
    const logoFile = new File([Buffer.from('PNG_LOGO_BYTES')], 'company-logo.png', { type: 'image/png' });
    const uploadedLogo = await adminMedia.uploadMediaFile(logoFile, {
      visibility: 'public',
      category: 'site_logo',
    });
    assert.equal(uploadedLogo.disk, 'public');
    assert.ok(uploadedLogo.url.startsWith('/storage/public-assets/site_logo/'));
    assert.ok(isPermanentFileReference(uploadedLogo.url));

    // 2. Client A cannot spoof ownership to Client B (ownerId=20)
    const ndaFile = new File([Buffer.from('%PDF-1.4 NDA')], 'nda.pdf', { type: 'application/pdf' });
    await assert.rejects(
      () =>
        clientAMedia.uploadMediaFile(ndaFile, {
          visibility: 'private',
          category: 'project_document',
          ownerType: 'client',
          ownerId: 20,
        }),
      (err: any) => err?.response?.status === 403
    );

    // 3. Client A uploads private NDA cleanly
    const uploadedNda = await clientAMedia.uploadMediaFile(ndaFile, {
      visibility: 'private',
      category: 'project_document',
      ownerType: 'client',
      ownerId: 10,
    });
    assert.equal(uploadedNda.disk, 'local');
    assert.equal(uploadedNda.url, `/api/media/${uploadedNda.file_uid}/download`);
    const initialStoragePath = uploadedNda.storage_path;
    assert.equal(fs.existsSync(path.join(tmpRoot, 'disks', 'local', initialStoragePath)), true);

    // Simulate full server shutdown & restart pointing at the same persistent volume
    server1.closeAllConnections();
    await new Promise<void>((resolve) => server1.close(() => resolve()));

    const server2 = createDiskBackedMediaServer(tmpRoot);
    await new Promise<void>((resolve) => server2.listen(0, '127.0.0.1', () => resolve()));

    try {
      const port2 = (server2.address() as { port: number }).port;
      const base2 = `http://127.0.0.1:${port2}`;

      const clientA2 = createApiClient(base2);
      clientA2.defaults.headers.common['x-test-user'] = 'clientA';
      const mediaA2 = createMediaService(clientA2);

      const clientB2 = createApiClient(base2);
      clientB2.defaults.headers.common['x-test-user'] = 'clientB';
      const mediaB2 = createMediaService(clientB2);

      // 4. After restart, persisted metadata and file bytes are still accessible by authorized Client A
      const listedA = await mediaA2.listMediaFiles();
      assert.equal(listedA.some((m) => m.file_uid === uploadedNda.file_uid), true);

      const signedUrl = await mediaA2.getSignedDownloadUrl(uploadedNda.file_uid, 5);
      const dlRes = await clientA2.get(signedUrl, { responseType: 'text' });
      assert.equal(dlRes.status, 200);
      assert.equal(dlRes.data, '%PDF-1.4 NDA');

      // 5. Client B cannot access signed URL, replace, or delete Client A's file
      await assert.rejects(
        () => mediaB2.getSignedDownloadUrl(uploadedNda.file_uid, 5),
        (err: any) => err?.response?.status === 403
      );
      await assert.rejects(
        () => clientB2.get(signedUrl),
        (err: any) => err?.response?.status === 403
      );
      await assert.rejects(
        () => mediaB2.deleteMediaFile(uploadedNda.file_uid),
        (err: any) => err?.response?.status === 403
      );

      // 6. Replace file removes old disk object and creates a new UUID file
      const ndaV2 = new File([Buffer.from('%PDF-1.4 NDA-V2')], 'nda-v2.pdf', { type: 'application/pdf' });
      const replaced = await mediaA2.replaceMediaFile(uploadedNda.file_uid, ndaV2, 'private');
      assert.notEqual(replaced.storage_path, initialStoragePath);
      assert.equal(fs.existsSync(path.join(tmpRoot, 'disks', 'local', initialStoragePath)), false);
      assert.equal(fs.existsSync(path.join(tmpRoot, 'disks', 'local', replaced.storage_path)), true);

      // 7. Delete file removes both metadata and stored object
      await mediaA2.deleteMediaFile(uploadedNda.file_uid);
      assert.equal(fs.existsSync(path.join(tmpRoot, 'disks', 'local', replaced.storage_path)), false);
      await assert.rejects(
        () => mediaA2.getMediaFile(uploadedNda.file_uid),
        (err: any) => err?.response?.status === 404
      );
    } finally {
      server2.closeAllConnections();
      await new Promise<void>((resolve) => server2.close(() => resolve()));
    }
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
});

test('Settings.tsx and SettingsContext.tsx never persist Base64 Data URLs or temporary blob: Object URLs', () => {
  const settingsPage = fs.readFileSync(path.resolve('src/pages/dashboard/Settings.tsx'), 'utf8');
  const settingsContext = fs.readFileSync(path.resolve('src/contexts/SettingsContext.tsx'), 'utf8');

  assert.equal(settingsPage.includes('readAsDataURL'), false);
  assert.equal(settingsPage.includes('createTemporaryPreviewUrl'), true);
  assert.equal(settingsPage.includes('revokeTemporaryPreviewUrl'), true);
  assert.equal(settingsPage.includes('uploadMediaFile'), true);
  assert.equal(settingsContext.includes('sanitizePersistedMediaUrl'), true);
});
