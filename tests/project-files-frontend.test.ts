import test from 'node:test';
import assert from 'node:assert/strict';
import type { AxiosInstance, AxiosProgressEvent } from 'axios';
import { createMediaService } from '../src/services/mediaService';
import type { MediaFileMetadata } from '../src/types/media';

interface CapturedCall {
  method: 'get' | 'post' | 'delete';
  url: string;
  data?: unknown;
  config?: Record<string, unknown>;
}

function createMediaServiceHarness() {
  const calls: CapturedCall[] = [];
  const fileRecord: MediaFileMetadata = {
    id: 41,
    file_uid: 'a5c7f0e1-4e53-4ac2-a77e-890f5f3f5c91',
    visibility: 'private',
    category: 'deliverable',
    original_filename: 'final-deliverable.pdf',
    mime_type: 'application/pdf',
    extension: 'pdf',
    file_size: 18,
    uploader: { id: 7, name: 'Admin' },
    url: '/api/media/a5c7f0e1-4e53-4ac2-a77e-890f5f3f5c91/download',
    created_at: '2026-11-26T10:00:00.000Z',
    updated_at: '2026-11-26T10:00:00.000Z',
  };

  const client = {
    get: async (url: string, config?: Record<string, unknown>) => {
      calls.push({ method: 'get', url, config });
      if (url === '/sanctum/csrf-cookie') return { data: null, status: 204 };
      if (url.includes('/files')) return { data: { success: true, data: [fileRecord] }, status: 200 };
      return { data: { success: true, data: fileRecord }, status: 200 };
    },
    post: async (url: string, data?: unknown, config?: Record<string, unknown>) => {
      calls.push({ method: 'post', url, data, config });
      return { data: { success: true, data: fileRecord }, status: 201 };
    },
    delete: async (url: string) => {
      calls.push({ method: 'delete', url });
      return { data: { success: true }, status: 200 };
    },
  } as unknown as AxiosInstance;

  return { service: createMediaService(client), calls, fileRecord };
}

function makePdfFile(): File {
  return new File(['%PDF-1.4\nexample\n%%EOF'], 'final-deliverable.pdf', {
    type: 'application/pdf',
  });
}

test('project file listing uses the correct admin/client endpoint and validates the response shape', async () => {
  const { service, calls, fileRecord } = createMediaServiceHarness();

  const adminFiles = await service.listProjectFiles(12, 'admin', 'deliverable');
  assert.deepEqual(adminFiles, [fileRecord]);
  assert.equal(calls.at(-1)?.url, '/api/projects/12/files');
  assert.deepEqual(calls.at(-1)?.config?.params, { category: 'deliverable' });

  const clientFiles = await service.listProjectFiles(12, 'client');
  assert.deepEqual(clientFiles, [fileRecord]);
  assert.equal(calls.at(-1)?.url, '/api/client/projects/12/files');
});

test('project file upload sends a categorized FormData body after CSRF initialization', async () => {
  const { service, calls, fileRecord } = createMediaServiceHarness();
  const progress: number[] = [];

  const uploaded = await service.uploadProjectFile(12, makePdfFile(), 'deliverable', (value) => {
    progress.push(value);
  });

  assert.equal(uploaded.file_uid, fileRecord.file_uid);
  assert.deepEqual(calls.slice(0, 2).map((call) => call.url), [
    '/sanctum/csrf-cookie',
    '/api/projects/12/files',
  ]);

  const uploadCall = calls[1];
  assert.ok(uploadCall.data instanceof FormData);
  assert.equal((uploadCall.data as FormData).get('category'), 'deliverable');
  assert.ok((uploadCall.data as FormData).get('file') instanceof File);
  assert.equal((uploadCall.config as { headers?: Record<string, string> })?.headers?.['Content-Type'], undefined);

  const progressHandler = (uploadCall.config as { onUploadProgress?: (event: AxiosProgressEvent) => void })?.onUploadProgress;
  progressHandler?.({ loaded: 50, total: 100 } as AxiosProgressEvent);
  assert.deepEqual(progress, [50]);
});

test('project file replacement and deletion use the scoped project routes', async () => {
  const { service, calls, fileRecord } = createMediaServiceHarness();

  const replaced = await service.replaceProjectFile(12, fileRecord.file_uid, makePdfFile(), 'report');
  assert.equal(replaced.file_uid, fileRecord.file_uid);
  assert.equal(calls[1]?.url, `/api/projects/12/files/${fileRecord.file_uid}/replace`);
  assert.ok(calls[1]?.data instanceof FormData);
  assert.equal((calls[1]?.data as FormData).get('category'), 'report');

  await service.deleteProjectFile(12, fileRecord.file_uid);
  assert.equal(calls.at(-1)?.method, 'delete');
  assert.equal(calls.at(-1)?.url, `/api/projects/12/files/${fileRecord.file_uid}`);
});
