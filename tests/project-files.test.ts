import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

import {
  MediaFileMetadata,
  PROJECT_FILE_CATEGORIES,
  formatFileSize,
  getProjectFileCategoryLabel,
  isPermanentFileReference,
  isPreviewableMimeType,
  validateUploadFile,
} from '../src/types/media';
import { createMediaService } from '../src/services/mediaService';
import { createApiClient } from '../src/lib/apiClient';

test('project file categories, size formatter, previewability, and file validation work cleanly', () => {
  assert.deepEqual(
    PROJECT_FILE_CATEGORIES.map((c) => c.value),
    ['contract', 'requirement', 'design', 'report', 'document', 'deliverable', 'attachment']
  );
  assert.equal(getProjectFileCategoryLabel('contract', 'en'), 'Contracts');
  assert.equal(getProjectFileCategoryLabel('deliverable', 'ar'), 'المخرجات والتسليمات');

  assert.equal(formatFileSize(0), '0 B');
  assert.equal(formatFileSize(1536), '1.5 KB');
  assert.equal(formatFileSize(3 * 1024 * 1024), '3.0 MB');

  assert.equal(isPreviewableMimeType('application/pdf'), true);
  assert.equal(isPreviewableMimeType('image/png'), true);
  assert.equal(isPreviewableMimeType('text/csv'), true);
  assert.equal(isPreviewableMimeType('application/zip'), false);

  assert.equal(
    validateUploadFile(
      {
        name: 'architecture-deck.pptx',
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        size: 1024 * 100,
      },
      'private'
    ).valid,
    true
  );
  assert.equal(
    validateUploadFile({ name: 'exploit.php', type: 'application/x-php', size: 120 }, 'private').valid,
    false
  );
  assert.equal(
    validateUploadFile({ name: 'oversized.pdf', type: 'application/pdf', size: 16 * 1024 * 1024 }, 'private')
      .valid,
    false
  );
});

function parseMultipart(rawBody: Buffer, contentType: string): {
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

function createProjectFilesTestServer(storageRoot: string) {
  const dbPath = path.join(storageRoot, 'project_media_db.json');
  const privateDiskRoot = path.join(storageRoot, 'private-disk');
  fs.mkdirSync(privateDiskRoot, { recursive: true });

  const dbProjects = [
    { id: 101, client_id: 10, name: 'Client A SaaS Portal' },
    { id: 202, client_id: 20, name: 'Client B Brand Overhaul' },
  ];

  const loadFiles = (): MediaFileMetadata[] => {
    if (!fs.existsSync(dbPath)) return [];
    return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  };
  const saveFiles = (rows: MediaFileMetadata[]) => {
    fs.writeFileSync(dbPath, JSON.stringify(rows, null, 2));
  };

  let nextId = loadFiles().reduce((max, r) => Math.max(max, r.id), 0) + 1;
  const secret = 'project-files-signing-secret';
  const validCategories = new Set(PROJECT_FILE_CATEGORIES.map((c) => c.value));

  const getActor = (req: http.IncomingMessage) => {
    const key = String(req.headers['x-test-actor'] || 'super_admin');
    switch (key) {
      case 'clientA':
        return { id: 1001, name: 'Client A User', role: 'client', clientId: 10, perms: [] as string[] };
      case 'clientB':
        return { id: 1002, name: 'Client B User', role: 'client', clientId: 20, perms: [] as string[] };
      case 'viewAdmin':
        return { id: 2, name: 'Viewer Admin', role: 'custom_admin', clientId: null, perms: ['view_projects'] };
      case 'updateAdmin':
        return {
          id: 3,
          name: 'Lead PM',
          role: 'custom_admin',
          clientId: null,
          perms: ['view_projects', 'update_projects'],
        };
      default:
        return { id: 1, name: 'Abdelrahman Admin', role: 'super_admin', clientId: null, perms: ['*'] };
    }
  };

  const hasPerm = (actor: ReturnType<typeof getActor>, needed: string[]) => {
    if (actor.role === 'super_admin') return true;
    if (actor.role !== 'custom_admin') return false;
    return needed.some((p) => actor.perms.includes(p));
  };

  return http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', 'http://127.0.0.1');
    const pathname = urlObj.pathname;
    const actor = getActor(req);

    if (req.method === 'GET' && pathname === '/sanctum/csrf-cookie') {
      res.writeHead(204, { 'Set-Cookie': 'XSRF-TOKEN=csrf-ok; Path=/; SameSite=Lax' });
      res.end();
      return;
    }

    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(Buffer.from(c));
    const rawBody = Buffer.concat(chunks);

    const json = (status: number, payload: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    // Client project files list: GET /api/client/projects/:id/files
    const clientFilesMatch = pathname.match(/^\/api\/client\/projects\/(\d+)\/files$/);
    if (req.method === 'GET' && clientFilesMatch) {
      if (actor.role !== 'client') return json(403, { message: 'Forbidden' });
      const project = dbProjects.find((p) => p.id === Number(clientFilesMatch[1]));
      if (!project) return json(404, { message: 'Project not found' });
      if (project.client_id !== actor.clientId) return json(403, { message: 'Forbidden' });

      const catFilter = urlObj.searchParams.get('category');
      const rows = loadFiles().filter(
        (f) => f.owner_id === project.id && (!catFilter || f.category === catFilter)
      );
      return json(200, { success: true, data: rows });
    }

    // Admin project files list & upload: /api/projects/:id/files
    const adminFilesMatch = pathname.match(/^\/api\/projects\/(\d+)\/files$/);
    if (adminFilesMatch) {
      const project = dbProjects.find((p) => p.id === Number(adminFilesMatch[1]));
      if (!project) return json(404, { message: 'Project not found' });

      if (req.method === 'GET') {
        if (!hasPerm(actor, ['view_projects', 'manage_projects'])) {
          return json(403, { message: 'Forbidden' });
        }
        const catFilter = urlObj.searchParams.get('category');
        const rows = loadFiles().filter(
          (f) => f.owner_id === project.id && (!catFilter || f.category === catFilter)
        );
        return json(200, { success: true, data: rows });
      }

      if (req.method === 'POST') {
        if (!hasPerm(actor, ['update_projects', 'manage_projects'])) {
          return json(403, { message: 'Forbidden' });
        }
        const { fields, file } = parseMultipart(rawBody, String(req.headers['content-type'] || ''));
        if (!file) return json(422, { message: 'Missing file.' });
        if (!validCategories.has(fields.category as any)) {
          return json(422, { message: 'Invalid project file category.' });
        }
        const check = validateUploadFile(
          { name: file.filename, type: file.mimeType, size: file.data.length },
          'private'
        );
        if (!check.valid) return json(422, { message: check.error });

        const fileUid = crypto.randomUUID();
        const storedFilename = `${fileUid}.${check.extension}`;
        const relDir = `private-clients/${project.id}/${fields.category}/2026/11`;
        const storagePath = `${relDir}/${storedFilename}`;
        fs.mkdirSync(path.join(privateDiskRoot, relDir), { recursive: true });
        fs.writeFileSync(path.join(privateDiskRoot, storagePath), file.data);

        // Deliberately ignore any browser-supplied client_id and derive from DB project
        const record: MediaFileMetadata = {
          id: nextId++,
          file_uid: fileUid,
          visibility: 'private',
          category: fields.category,
          original_filename: path.basename(file.filename),
          stored_filename: storedFilename,
          disk: 'local',
          storage_path: storagePath,
          mime_type: file.mimeType,
          extension: check.extension || 'bin',
          file_size: file.data.length,
          checksum_sha256: crypto.createHash('sha256').update(file.data).digest('hex'),
          owner_type: 'App\\Models\\Project',
          owner_id: project.id,
          client_id: project.client_id,
          uploaded_by: actor.id,
          uploader: { id: actor.id, name: actor.name, role: actor.role },
          url: `/api/media/${fileUid}/download`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const rows = loadFiles();
        rows.unshift(record);
        saveFiles(rows);
        return json(201, { success: true, data: record });
      }
    }

    // Replace project file: POST /api/projects/:id/files/:uid/replace
    const replaceMatch = pathname.match(/^\/api\/projects\/(\d+)\/files\/([^/]+)\/replace$/);
    if (req.method === 'POST' && replaceMatch) {
      if (!hasPerm(actor, ['update_projects', 'manage_projects'])) {
        return json(403, { message: 'Forbidden' });
      }
      const projectId = Number(replaceMatch[1]);
      const fileUid = decodeURIComponent(replaceMatch[2]);
      const rows = loadFiles();
      const idx = rows.findIndex((r) => r.file_uid === fileUid && r.owner_id === projectId);
      if (idx === -1) return json(404, { message: 'File not found' });

      const { fields, file } = parseMultipart(rawBody, String(req.headers['content-type'] || ''));
      if (!file) return json(422, { message: 'Missing file.' });
      const check = validateUploadFile(
        { name: file.filename, type: file.mimeType, size: file.data.length },
        'private'
      );
      if (!check.valid) return json(422, { message: check.error });

      const existing = rows[idx];
      const nextCat =
        fields.category && validCategories.has(fields.category as any)
          ? fields.category
          : existing.category;
      const newStored = `${crypto.randomUUID()}.${check.extension}`;
      const relDir = `private-clients/${projectId}/${nextCat}/2026/11`;
      const newStoragePath = `${relDir}/${newStored}`;
      fs.mkdirSync(path.join(privateDiskRoot, relDir), { recursive: true });
      fs.writeFileSync(path.join(privateDiskRoot, newStoragePath), file.data);

      const oldPath = path.join(privateDiskRoot, existing.storage_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

      rows[idx] = {
        ...existing,
        category: nextCat,
        original_filename: path.basename(file.filename),
        stored_filename: newStored,
        storage_path: newStoragePath,
        mime_type: file.mimeType,
        extension: check.extension || 'bin',
        file_size: file.data.length,
        uploaded_by: actor.id,
        uploader: { id: actor.id, name: actor.name, role: actor.role },
        updated_at: new Date().toISOString(),
      };
      saveFiles(rows);
      return json(200, { success: true, data: rows[idx] });
    }

    // Delete project file: DELETE /api/projects/:id/files/:uid
    const deleteMatch = pathname.match(/^\/api\/projects\/(\d+)\/files\/([^/]+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      if (!hasPerm(actor, ['delete_projects', 'manage_projects'])) {
        return json(403, { message: 'Forbidden' });
      }
      const projectId = Number(deleteMatch[1]);
      const fileUid = decodeURIComponent(deleteMatch[2]);
      const rows = loadFiles();
      const idx = rows.findIndex((r) => r.file_uid === fileUid && r.owner_id === projectId);
      if (idx === -1) return json(404, { message: 'File not found' });

      const oldPath = path.join(privateDiskRoot, rows[idx].storage_path);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      rows.splice(idx, 1);
      saveFiles(rows);
      return json(200, { success: true, message: 'Project file deleted.' });
    }

    // Shared media download, preview stream, and signed URL endpoints
    const canViewRecord = (record: MediaFileMetadata) => {
      if (hasPerm(actor, ['view_projects', 'manage_projects'])) return true;
      return actor.role === 'client' && record.client_id === actor.clientId;
    };

    const signedUrlMatch = pathname.match(/^\/api\/media\/([^/]+)\/signed-url$/);
    if (req.method === 'POST' && signedUrlMatch) {
      const record = loadFiles().find((r) => r.file_uid === decodeURIComponent(signedUrlMatch[1]));
      if (!record) return json(404, { message: 'Not found' });
      if (!canViewRecord(record)) return json(403, { message: 'Forbidden' });

      const expires = Date.now() + 5 * 60 * 1000;
      const sig = crypto.createHmac('sha256', secret).update(`${record.file_uid}:${expires}`).digest('hex');
      return json(200, {
        data: {
          file_uid: record.file_uid,
          signed_url: `http://${req.headers.host}/api/media/signed/${record.file_uid}?expires=${expires}&signature=${sig}`,
          expires_in_minutes: 5,
        },
      });
    }

    const signedDlMatch = pathname.match(/^\/api\/media\/signed\/([^/]+)$/);
    if (req.method === 'GET' && signedDlMatch) {
      const fileUid = decodeURIComponent(signedDlMatch[1]);
      const expires = Number(urlObj.searchParams.get('expires') || '0');
      const sig = urlObj.searchParams.get('signature') || '';
      const expected = crypto.createHmac('sha256', secret).update(`${fileUid}:${expires}`).digest('hex');
      if (sig !== expected || Date.now() > expires) return json(403, { message: 'Invalid signature' });

      const record = loadFiles().find((r) => r.file_uid === fileUid);
      if (!record) return json(404, { message: 'Not found' });
      if (!canViewRecord(record)) return json(403, { message: 'Forbidden' });

      const bytes = fs.readFileSync(path.join(privateDiskRoot, record.storage_path));
      res.writeHead(200, {
        'Content-Type': record.mime_type,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store, max-age=0',
      });
      res.end(bytes);
      return;
    }

    const directStreamMatch = pathname.match(/^\/api\/media\/([^/]+)\/download$/);
    if (req.method === 'GET' && directStreamMatch) {
      const record = loadFiles().find((r) => r.file_uid === decodeURIComponent(directStreamMatch[1]));
      if (!record) return json(404, { message: 'Not found' });
      if (!canViewRecord(record)) return json(403, { message: 'Forbidden' });

      const bytes = fs.readFileSync(path.join(privateDiskRoot, record.storage_path));
      res.writeHead(200, {
        'Content-Type': record.mime_type,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store, max-age=0',
      });
      res.end(bytes);
      return;
    }

    return json(404, { message: 'Not found' });
  });
}

test('two-client project file isolation, admin upload/replace/delete permissions, metadata, and persistence across restart', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'project-files-e2e-'));
  let server1 = createProjectFilesTestServer(tmpDir);
  await new Promise<void>((resolve) => server1.listen(0, '127.0.0.1', () => resolve()));

  try {
    const base1 = `http://127.0.0.1:${(server1.address() as { port: number }).port}`;

    const mkService = (actor: string) => {
      const client = createApiClient(base1);
      client.defaults.headers.common['x-test-actor'] = actor;
      return { client, media: createMediaService(client) };
    };

    const superAdmin = mkService('super_admin');
    const viewAdmin = mkService('viewAdmin');
    const updateAdmin = mkService('updateAdmin');
    const clientA = mkService('clientA');
    const clientB = mkService('clientB');

    // 1. Admin uploads contract to Project 101 (Client A) & deliverable to Project 202 (Client B)
    const progressEvents: number[] = [];
    const contractA = new File([Buffer.from('%PDF-1.4 CONTRACT_ALPHA')], 'alpha-contract.pdf', {
      type: 'application/pdf',
    });
    const uploadedA = await superAdmin.media.uploadProjectFile(
      101,
      contractA,
      'contract',
      (pct) => progressEvents.push(pct)
    );
    assert.equal(uploadedA.owner_id, 101);
    assert.equal(uploadedA.client_id, 10);
    assert.equal(uploadedA.category, 'contract');
    assert.equal(uploadedA.original_filename, 'alpha-contract.pdf');
    assert.equal(uploadedA.uploader?.name, 'Abdelrahman Admin');
    assert.equal(uploadedA.url, `/api/media/${uploadedA.file_uid}/download`);
    assert.ok(isPermanentFileReference(uploadedA.url));
    assert.equal(uploadedA.url.startsWith('/storage/'), false);
    assert.ok(progressEvents.length >= 1);

    const deliverableB = new File([Buffer.from('PNG_BETA_DESIGN')], 'beta-homepage.png', {
      type: 'image/png',
    });
    const uploadedB = await updateAdmin.media.uploadProjectFile(202, deliverableB, 'design');
    assert.equal(uploadedB.owner_id, 202);
    assert.equal(uploadedB.client_id, 20);
    assert.equal(uploadedB.uploader?.name, 'Lead PM');

    // Restart server against same storage directory to confirm persistence
    server1.closeAllConnections();
    await new Promise<void>((resolve) => server1.close(() => resolve()));

    const server2 = createProjectFilesTestServer(tmpDir);
    await new Promise<void>((resolve) => server2.listen(0, '127.0.0.1', () => resolve()));

    try {
      const base2 = `http://127.0.0.1:${(server2.address() as { port: number }).port}`;
      const mk2 = (actor: string) => {
        const client = createApiClient(base2);
        client.defaults.headers.common['x-test-actor'] = actor;
        return { client, media: createMediaService(client) };
      };

      const sAdmin2 = mk2('super_admin');
      const vAdmin2 = mk2('viewAdmin');
      const uAdmin2 = mk2('updateAdmin');
      const cA2 = mk2('clientA');
      const cB2 = mk2('clientB');

      // 2. Client A lists & downloads ONLY Project 101 files
      const listA = await cA2.media.listProjectFiles(101, 'client');
      assert.equal(listA.length, 1);
      assert.equal(listA[0].file_uid, uploadedA.file_uid);

      const signedUrlA = await cA2.media.getSignedDownloadUrl(uploadedA.file_uid, 5);
      const dlResA = await cA2.client.get(signedUrlA, { responseType: 'text' });
      assert.equal(dlResA.data, '%PDF-1.4 CONTRACT_ALPHA');

      // 3. Two-client isolation: Client A cannot list or download Client B's files, and vice versa
      await assert.rejects(
        () => cA2.media.listProjectFiles(202, 'client'),
        (err: any) => err?.response?.status === 403
      );
      await assert.rejects(
        () => cA2.media.getSignedDownloadUrl(uploadedB.file_uid, 5),
        (err: any) => err?.response?.status === 403
      );
      await assert.rejects(
        () => cA2.client.get(cA2.media.getAuthorizedDownloadUrl(uploadedB.file_uid)),
        (err: any) => err?.response?.status === 403
      );

      await assert.rejects(
        () => cB2.media.listProjectFiles(101, 'client'),
        (err: any) => err?.response?.status === 403
      );
      await assert.rejects(
        () => cB2.media.getSignedDownloadUrl(uploadedA.file_uid, 5),
        (err: any) => err?.response?.status === 403
      );
      await assert.rejects(
        () => cB2.client.get(signedUrlA),
        (err: any) => err?.response?.status === 403
      );

      // 4. Clients cannot upload, replace, or delete project files
      const rogueFile = new File([Buffer.from('%PDF-1.4 ROGUE')], 'rogue.pdf', { type: 'application/pdf' });
      await assert.rejects(
        () => cA2.media.uploadProjectFile(101, rogueFile, 'document'),
        (err: any) => err?.response?.status === 403
      );
      await assert.rejects(
        () => cA2.media.replaceProjectFile(101, uploadedA.file_uid, rogueFile),
        (err: any) => err?.response?.status === 403
      );
      await assert.rejects(
        () => cA2.media.deleteProjectFile(101, uploadedA.file_uid),
        (err: any) => err?.response?.status === 403
      );

      // 5. View-only admin can list, but cannot upload/replace/delete
      const adminList = await vAdmin2.media.listProjectFiles(101, 'admin');
      assert.equal(adminList.length, 1);
      await assert.rejects(
        () => vAdmin2.media.uploadProjectFile(101, rogueFile, 'report'),
        (err: any) => err?.response?.status === 403
      );

      // 6. Update admin can replace (deletes old object on disk) but cannot delete
      const oldPath = uploadedA.storage_path;
      const contractV2 = new File([Buffer.from('%PDF-1.4 CONTRACT_ALPHA_V2')], 'alpha-contract-v2.pdf', {
        type: 'application/pdf',
      });
      const replaced = await uAdmin2.media.replaceProjectFile(101, uploadedA.file_uid, contractV2, 'deliverable');
      assert.equal(replaced.category, 'deliverable');
      assert.notEqual(replaced.storage_path, oldPath);
      assert.equal(fs.existsSync(path.join(tmpDir, 'private-disk', oldPath)), false);
      assert.equal(fs.existsSync(path.join(tmpDir, 'private-disk', replaced.storage_path)), true);

      await assert.rejects(
        () => uAdmin2.media.deleteProjectFile(101, uploadedA.file_uid),
        (err: any) => err?.response?.status === 403
      );

      // 7. Super admin deletes file cleanly and disk object + metadata are removed
      await sAdmin2.media.deleteProjectFile(101, uploadedA.file_uid);
      assert.equal(fs.existsSync(path.join(tmpDir, 'private-disk', replaced.storage_path)), false);
      const afterDeleteList = await sAdmin2.media.listProjectFiles(101, 'admin');
      assert.equal(afterDeleteList.length, 0);
    } finally {
      server2.closeAllConnections();
      await new Promise<void>((resolve) => server2.close(() => resolve()));
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('project file components avoid localStorage, window.open/confirm, DataURLs, and revoke temporary previews', () => {
  const filesToAudit = [
    'src/components/client/ClientProjectFiles.tsx',
    'src/components/dashboard/AdminProjectFiles.tsx',
    'src/components/common/FilePreviewModal.tsx',
    'src/components/client/ClientProjectStatus.tsx',
    'src/contexts/ProjectsContext.tsx',
    'src/pages/dashboard/ProjectsPage.tsx',
  ];

  for (const rel of filesToAudit) {
    const content = fs.readFileSync(path.resolve(rel), 'utf8');
    assert.equal(/localStorage\.(getItem|setItem)/.test(content), false, `${rel} must not use localStorage`);
    assert.equal(/window\.(open|confirm|alert)/.test(content), false, `${rel} must not use window.open/confirm/alert`);
    assert.equal(content.includes('readAsDataURL'), false, `${rel} must not read files as Base64 DataURLs`);
  }

  const adminComp = fs.readFileSync(path.resolve('src/components/dashboard/AdminProjectFiles.tsx'), 'utf8');
  assert.equal(adminComp.includes('revokeTemporaryPreviewUrl'), true);
  assert.equal(adminComp.includes('uploadProjectFile'), true);
  assert.equal(adminComp.includes('replaceProjectFile'), true);
  assert.equal(adminComp.includes('deleteProjectFile'), true);

  const clientComp = fs.readFileSync(path.resolve('src/components/client/ClientProjectFiles.tsx'), 'utf8');
  assert.equal(clientComp.includes('downloadAuthorizedFile'), true);
  assert.equal(clientComp.includes('fetchProjectFiles'), true);
});
